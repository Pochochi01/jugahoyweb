const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/imagesController');
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', ctrl.getAll);
router.use(authenticate, requireRole('general_admin'));
router.post('/upload', upload.single('image'), ctrl.upload);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
