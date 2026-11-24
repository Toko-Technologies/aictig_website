/**
 * Image uploads (team photos).
 *
 * Only JPEG, PNG and WebP are accepted, up to 5 MB. The file type is checked
 * from the file's actual contents, not its name, and each file is saved under
 * a new random name, so an upload can never replace another file or be served
 * as a web page or script.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { HttpError } = require('./auth.cjs');

const MAX_BYTES = 5 * 1024 * 1024;

function detectImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** PDF or Word document, recognised from the file contents. Returns the MIME type or null. */
function detectDocumentType(buf, filename = '') {
  if (buf.length > 4 && buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && /\.docx$/i.test(filename)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && /\.doc$/i.test(filename)) {
    return 'application/msword';
  }
  return null;
}

const IMAGE_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Parser for pictures and documents uploaded in the dashboard (news pictures,
 * attachments, repository documents). Checks the real file type from the
 * contents and sets req.file.mimetype and req.file.kind ('image' | 'document').
 */
function fileParser({ images = true, documents = true, maxMb = 30 } = {}) {
  const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 5 } }).single('file');
  return (req, res, next) => {
    parser(req, res, (err) => {
      if (err) {
        return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? `This file is larger than ${maxMb} MB.` : 'The upload failed. Please try again.'));
      }
      if (!req.file) return next(new HttpError(400, 'Please choose a file to upload.'));
      const image = images ? detectImageType(req.file.buffer) : null;
      const doc = documents ? detectDocumentType(req.file.buffer, req.file.originalname) : null;
      if (!image && !doc) {
        const allowed = [images && 'JPG, PNG or WebP image', documents && 'PDF or Word document'].filter(Boolean).join(', or a ');
        return next(new HttpError(400, `Please upload a ${allowed}.`));
      }
      req.file.mimetype = image ? IMAGE_MIME[image] : doc;
      req.file.kind = image ? 'image' : 'document';
      return next();
    });
  };
}

function createUploads(config) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1, fields: 0 },
  }).single('file');

  /** Express handler: saves the uploaded image and returns its public URL. */
  function handleUpload(req, res, next) {
    parser(req, res, (err) => {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return next(new HttpError(400, tooBig ? 'This image is larger than 5 MB. Please choose a smaller image.' : 'The upload failed. Please try again.'));
      }
      if (!req.file) return next(new HttpError(400, 'Please choose an image to upload.'));
      const ext = detectImageType(req.file.buffer);
      if (!ext) return next(new HttpError(400, 'Please upload a JPG, PNG or WebP image.'));
      const name = `${crypto.randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(config.uploadsDir, name), req.file.buffer, { flag: 'wx' });
      return res.status(201).json({ url: `/uploads/${name}` });
    });
  }

  const DOC_EXT = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
  };
  const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  /**
   * Store a checked file (from fileParser) under a new random name and return
   * its public address. Documents go in uploads/documents, pictures in uploads/.
   */
  function saveFile(file) {
    const ext = DOC_EXT[file.mimetype] || IMAGE_EXT[file.mimetype];
    if (!ext) throw new HttpError(400, 'Unsupported file type.');
    const folder = file.kind === 'document' ? 'documents' : '';
    const dir = path.join(config.uploadsDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(dir, name), file.buffer, { flag: 'wx' });
    return {
      url: folder ? `/uploads/${folder}/${name}` : `/uploads/${name}`,
      name: file.originalname.slice(0, 200),
      size: file.buffer.length,
      mime: file.mimetype,
    };
  }

  return { handleUpload, saveFile };
}

module.exports = { createUploads, detectImageType, detectDocumentType, fileParser };
