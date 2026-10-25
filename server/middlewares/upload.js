import multer from "multer";

const maxMb = Number(process.env.MAX_PDF_SIZE_MB || 15);

// PDFs are kept in memory just long enough to forward them to the chatbot service.
export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" && file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      const err = new Error("Only PDF files are supported.");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
}).single("file");
