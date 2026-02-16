'use client';

import { useState, useRef, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

interface ImageUploadProps {
  value: string; // Current CID
  onChange: (cid: string) => void;
  label?: string;
  helpText?: string;
  className?: string;
}

export default function ImageUpload({
  value,
  onChange,
  label = 'Cover Image',
  helpText,
  className = '',
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get preview URL from CID or local preview
  const imageUrl = preview || (value ? `https://ipfs.io/ipfs/${value}` : null);

  const handleUpload = useCallback(async (file: File) => {
    setError('');
    setUploading(true);

    // Create local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/upload/image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        onChange(data.data.cid);
        setPreview(null); // Clear local preview, use IPFS URL now
      } else {
        setError(data.error || 'Upload failed');
        setPreview(null);
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleRemove = () => {
    onChange('');
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium mb-1">
          {label} <span className="text-slate-400 font-normal">(optional)</span>
        </label>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg transition-colors
          ${dragActive 
            ? 'border-argus-500 bg-argus-50 dark:bg-argus-900/20' 
            : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
          }
          ${imageUrl ? 'p-2' : 'p-6'}
        `}
      >
        {imageUrl ? (
          // Preview mode
          <div className="relative">
            <img
              src={imageUrl}
              alt="Preview"
              className="w-full h-40 object-cover rounded-lg"
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                <div className="flex items-center gap-2 text-white">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Uploading...</span>
                </div>
              </div>
            )}
            {!uploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition"
                title="Remove image"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          // Upload prompt
          <div className="text-center">
            <div className="text-4xl mb-2">🖼️</div>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading...
                </span>
              ) : (
                <>Drag & drop an image here, or </>
              )}
            </p>
            {!uploading && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg text-sm transition"
              >
                Choose File
              </button>
            )}
            <p className="text-xs text-slate-400 mt-2">
              JPEG, PNG, GIF, WebP • Max 5MB
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 mt-1">{error}</p>
      )}

      {helpText && !error && (
        <p className="text-xs text-slate-500 mt-1">{helpText}</p>
      )}
    </div>
  );
}
