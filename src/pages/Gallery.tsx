import { useState, useEffect } from 'react';
import { CalendarIcon, MapPinIcon } from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import PageHeader from '../components/PageHeader';
import Lightbox from '../components/Lightbox';
import { CardSkeleton } from '../components/Skeleton';
import type { GalleryImage } from '../types';

export default function Gallery() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    fetch('/data/gallery.json')
      .then((r) => r.json())
      .then((data) => setImages(data))
      .catch((err) => console.error('Failed to fetch gallery:', err))
      .finally(() => setLoading(false));
  }, []);

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  const handlePrevious = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setLightboxOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, images.length]);

  return (
    <>
      <Seo
        title="Photo Gallery"
        description="Browse photos from AICTiG events, conferences, and activities"
      />
      <main className="bg-neutral-50 min-h-screen">
        <PageHeader title="Photo Gallery" subtitle="Explore moments from our events, conferences, workshops, and activities across Africa" />
        <div className="container-custom py-10 md:py-12">

          {/* Gallery grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((image, index) => (
                <article
                  key={image.id}
                  className="group bg-white rounded-xl border border-neutral-200 overflow-hidden transition hover:border-primary-300 hover:shadow-md cursor-pointer"
                  onClick={() => openLightbox(index)}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-neutral-200">
                    <img
                      src={image.image}
                      alt={`Gallery photo: ${image.title}`}
                      loading="lazy"
                      decoding="async"
                      width="400"
                      height="300"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <h2 className="font-semibold text-neutral-900 mb-2 line-clamp-2">
                      {image.title}
                    </h2>
                    {image.caption && (
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {image.caption}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      {image.date && (
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          <span>
                            {new Date(image.date).toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      )}
                      {image.country && (
                        <div className="flex items-center gap-1">
                          <MapPinIcon className="w-4 h-4" />
                          <span>{image.country}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Lightbox */}
      <Lightbox
        images={images}
        currentIndex={currentImageIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />
    </>
  );
}
