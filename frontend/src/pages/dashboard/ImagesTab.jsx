import { useState, useEffect } from 'react';
import { imagesService } from '../../services/imagesService';
import { Upload, Trash2, Image } from 'lucide-react';

export default function ImagesTab() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    imagesService.getAll().then(setImages).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    fd.append('tipo', 'hero_slider');
    setUploading(true);
    try {
      await imagesService.upload(fd);
      load();
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar imagen?')) return;
    await imagesService.remove(id);
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Imágenes del sitio</h2>
        <label className={`btn-primary flex items-center gap-2 text-sm py-2 px-4 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4" /> {uploading ? 'Subiendo...' : 'Subir imagen'}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {images.length === 0 ? (
        <div className="card text-center py-16 text-muted-foreground">
          <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay imágenes cargadas. Subí la primera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map(img => (
            <div key={img.id} className="card p-2 group relative">
              <img src={img.url} alt={img.alt_text || ''} className="w-full h-32 object-cover rounded-lg" />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground capitalize">{img.tipo?.replace('_', ' ')}</span>
                <button onClick={() => remove(img.id)} className="p-1 text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
