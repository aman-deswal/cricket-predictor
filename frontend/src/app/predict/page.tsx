import { Suspense } from 'react';
import { PredictDetails } from './PredictDetails';

export default function PredictPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
        </div>
      )}
    >
      <PredictDetails />
    </Suspense>
  );
}