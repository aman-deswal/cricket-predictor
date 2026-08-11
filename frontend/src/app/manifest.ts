import type { MetadataRoute } from 'next';

const productionBasePath = process.env.NODE_ENV === 'production' ? '/cricket-predictor' : '';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SixSense Cricket Predictions',
    short_name: 'SixSense',
    description: 'Cricket match predictions, market edges, and matchup intelligence.',
    start_url: `${productionBasePath}/`,
    scope: `${productionBasePath}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0e1116',
    theme_color: '#0e1116',
    categories: ['sports', 'entertainment'],
    icons: [
      {
        src: `${productionBasePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${productionBasePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${productionBasePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `${productionBasePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
