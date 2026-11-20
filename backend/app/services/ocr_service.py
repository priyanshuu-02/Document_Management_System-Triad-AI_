"""Gets the text out of uploaded files so they can be searched.

We try three ways, in order, and stop as soon as one finds text:

1. Text already in the PDF - most PDFs made on a computer have it. Fast and exact.
2. Tesseract OCR - for images and scanned PDFs (pages are turned into
   pictures with PyMuPDF first). Runs inside our own container, free and offline.
3. LLMWhisperer - an optional cloud OCR service. Only used if
   UNSTRACT_API_KEY is set and Tesseract found almost nothing.

If a file is broken or a step fails, we just store no text and log why.
The upload itself still works.
"""
import io
import logging
import shutil

import requests
from pypdf import PdfReader
import pdfplumber

from app.config import Config

logger = logging.getLogger(__name__)

try:
    import pytesseract
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - only when optional deps are absent
    pytesseract = None
    Image = ImageOps = None

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp")
UNSTRACT_URL = (
    "https://llmwhisperer-api.us-central.unstract.com/api/v2/whisper"
    "?processing_mode=sync&output_mode=layout_preserving&mode=high_quality"
)
# Small images are enlarged to about this width first, because Tesseract
# reads tiny text badly.
MIN_OCR_WIDTH = 1500


class OCRService:
    # ------------------------------------------------------------------ API
    @staticmethod
    def extract_text(file_bytes: bytes, filename: str = "", content_type: str = "") -> str:
        """Return the best available text for the file ("" if none)."""
        text, engine = OCRService.extract_text_with_engine(file_bytes, filename, content_type)
        logger.info("Text extraction for '%s': %d chars via %s", filename, len(text), engine)
        return text

    @staticmethod
    def extract_text_with_engine(file_bytes: bytes, filename: str = "", content_type: str = ""):
        """Same as extract_text, but also says which method found the text."""
        if not file_bytes:
            return "", "none"

        name = (filename or "").lower()
        ctype = (content_type or "").lower()
        is_pdf = name.endswith(".pdf") or "pdf" in ctype
        is_image = name.endswith(IMAGE_EXTENSIONS) or ctype.startswith("image/")
        is_text = name.endswith(".txt") or ctype == "text/plain"

        if is_text:
            return file_bytes.decode("utf-8", errors="ignore").strip(), "plain_text"

        if not (is_pdf or is_image):
            return "", "unsupported"

        # Way 1: text that is already inside the PDF.
        if is_pdf:
            text = OCRService._pdf_embedded_text(file_bytes)
            if text:
                return text, "pdf_text_layer"

        # Way 2: read the text from the picture with Tesseract.
        ocr_text = OCRService._tesseract_pdf(file_bytes) if is_pdf else OCRService._tesseract_image(file_bytes)
        if len(ocr_text) >= Config.OCR_MIN_TEXT_LENGTH:
            return ocr_text, "tesseract"

        # Way 3: optional cloud OCR, for files Tesseract couldn't read well.
        cloud_text = OCRService._unstract(file_bytes, filename)
        if cloud_text:
            return cloud_text, "llmwhisperer"

        return ocr_text, ("tesseract" if ocr_text else "none")

    @staticmethod
    def tesseract_available() -> bool:
        if pytesseract is None:
            return False
        OCRService._configure_tesseract()
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False

    # ------------------------------------------- Way 1: text inside the PDF
    @staticmethod
    def _pdf_embedded_text(file_bytes: bytes) -> str:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
            if text:
                return text
        except Exception as err:
            logger.warning("pypdf could not read PDF (%s); trying pdfplumber.", err)
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return "\n".join((page.extract_text() or "") for page in pdf.pages).strip()
        except Exception as err:
            logger.warning("pdfplumber could not read PDF either (%s).", err)
            return ""

    # ------------------------------------------- Way 2: Tesseract OCR
    @staticmethod
    def _configure_tesseract():
        if Config.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = Config.TESSERACT_CMD
        elif not shutil.which("tesseract"):
            logger.debug("tesseract binary not found on PATH")

    @staticmethod
    def _prepare_image(image):
        """Small clean-up that helps Tesseract: straighten, grey, enlarge, more contrast."""
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("L", "RGB"):
            image = image.convert("RGB")
        image = ImageOps.grayscale(image)
        if image.width < MIN_OCR_WIDTH:
            scale = MIN_OCR_WIDTH / float(image.width)
            image = image.resize((MIN_OCR_WIDTH, int(image.height * scale)), Image.LANCZOS)
        return ImageOps.autocontrast(image)

    @staticmethod
    def _ocr_image(image) -> str:
        return pytesseract.image_to_string(OCRService._prepare_image(image), lang=Config.OCR_LANGUAGES).strip()

    @staticmethod
    def _tesseract_image(file_bytes: bytes) -> str:
        if pytesseract is None:
            logger.warning("pytesseract/Pillow not installed; image OCR skipped.")
            return ""
        OCRService._configure_tesseract()
        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                pages = []
                # Some images (like multi-page TIFFs) have several pages; read each one.
                for frame in range(min(getattr(img, "n_frames", 1), Config.OCR_MAX_PAGES)):
                    img.seek(frame)
                    pages.append(OCRService._ocr_image(img.copy()))
                return "\n".join(p for p in pages if p).strip()
        except Exception as err:
            logger.warning("Tesseract image OCR failed: %s", err)
            return ""

    @staticmethod
    def _tesseract_pdf(file_bytes: bytes) -> str:
        if pytesseract is None or fitz is None:
            logger.warning("pytesseract/PyMuPDF not installed; scanned-PDF OCR skipped.")
            return ""
        OCRService._configure_tesseract()
        try:
            pages = []
            with fitz.open(stream=file_bytes, filetype="pdf") as pdf:
                for index, page in enumerate(pdf):
                    if index >= Config.OCR_MAX_PAGES:
                        logger.info("Scanned PDF has more than %d pages; remaining pages not OCR'd.", Config.OCR_MAX_PAGES)
                        break
                    pix = page.get_pixmap(dpi=Config.OCR_PDF_DPI, colorspace=fitz.csGRAY)
                    image = Image.frombytes("L", (pix.width, pix.height), pix.samples)
                    pages.append(OCRService._ocr_image(image))
            return "\n".join(p for p in pages if p).strip()
        except Exception as err:
            logger.warning("Tesseract PDF OCR failed: %s", err)
            return ""

    # ------------------------------------------- Way 3: LLMWhisperer (optional)
    @staticmethod
    def _unstract(file_bytes: bytes, filename: str) -> str:
        api_key = Config.UNSTRACT_API_KEY
        if not api_key:
            return ""
        try:
            logger.info("Submitting '%s' to Unstract LLMWhisperer...", filename)
            resp = requests.post(
                UNSTRACT_URL,
                headers={"unstract-key": api_key, "Content-Type": "application/octet-stream"},
                data=file_bytes,
                timeout=60,
            )
            if resp.status_code != 200:
                logger.warning("LLMWhisperer returned HTTP %s", resp.status_code)
                return ""
            data = resp.json()
            text = data.get("result_text") or (data.get("extraction") or {}).get("result_text") or data.get("extracted_text")
            return (text or "").strip()
        except Exception as err:
            logger.warning("LLMWhisperer call failed: %s", err)
            return ""
