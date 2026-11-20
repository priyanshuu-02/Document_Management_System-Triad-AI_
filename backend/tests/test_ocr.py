"""OCR tier tests.  Tesseract-dependent cases are skipped where it is not installed
(they always run inside the backend Docker image).

    cd backend && python -m unittest tests.test_ocr -v
"""
import io
import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "unit-test-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont

from app.services.ocr_service import OCRService

PHRASE = "QUARTERLY FINANCIAL REPORT 2025"
HAS_TESSERACT = OCRService.tesseract_available()


def make_text_image(text=PHRASE, fmt="PNG") -> bytes:
    image = Image.new("RGB", (1400, 220), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 70), text, fill="black", font=ImageFont.load_default(size=64))
    buf = io.BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


def make_scanned_pdf() -> bytes:
    """A PDF whose only content is a picture of text (no text layer)."""
    pdf = fitz.open()
    page = pdf.new_page(width=700, height=300)
    page.insert_image(fitz.Rect(20, 50, 680, 160), stream=make_text_image())
    data = pdf.tobytes()
    pdf.close()
    return data


def make_digital_pdf() -> bytes:
    pdf = fitz.open()
    pdf.new_page().insert_text((72, 72), "Embedded text layer invoice 4471")
    data = pdf.tobytes()
    pdf.close()
    return data


def normalise(text: str) -> str:
    return " ".join(text.upper().split())


class OCRTierTests(unittest.TestCase):
    def test_digital_pdf_uses_text_layer(self):
        text, engine = OCRService.extract_text_with_engine(make_digital_pdf(), "invoice.pdf", "application/pdf")
        self.assertEqual(engine, "pdf_text_layer")
        self.assertIn("invoice 4471", text)

    def test_plain_text(self):
        text, engine = OCRService.extract_text_with_engine(b"hello notes", "notes.txt", "text/plain")
        self.assertEqual((text, engine), ("hello notes", "plain_text"))

    def test_corrupt_pdf_fails_soft(self):
        # The official test_sample.pdf is a 1 KB dummy with no real pages
        dummy = b"%PDF-1.4\n%" + b"A" * 1024 + b"\n%%EOF"
        text, _ = OCRService.extract_text_with_engine(dummy, "test_sample.pdf", "application/pdf")
        self.assertEqual(text, "")

    def test_unsupported_type(self):
        self.assertEqual(OCRService.extract_text_with_engine(b"PK\x03\x04", "a.zip", "application/zip"), ("", "unsupported"))

    @unittest.skipUnless(HAS_TESSERACT, "tesseract not installed")
    def test_png_image_ocr(self):
        text, engine = OCRService.extract_text_with_engine(make_text_image(), "scan.png", "image/png")
        self.assertEqual(engine, "tesseract")
        self.assertIn("FINANCIAL REPORT", normalise(text))

    @unittest.skipUnless(HAS_TESSERACT, "tesseract not installed")
    def test_jpeg_image_ocr(self):
        text, _ = OCRService.extract_text_with_engine(make_text_image(fmt="JPEG"), "photo.jpg", "image/jpeg")
        self.assertIn("QUARTERLY", normalise(text))

    @unittest.skipUnless(HAS_TESSERACT, "tesseract not installed")
    def test_scanned_pdf_ocr(self):
        text, engine = OCRService.extract_text_with_engine(make_scanned_pdf(), "scanned.pdf", "application/pdf")
        self.assertEqual(engine, "tesseract")
        self.assertIn("FINANCIAL REPORT", normalise(text))


if __name__ == "__main__":
    unittest.main()
