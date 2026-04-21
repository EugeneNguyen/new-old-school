'use client';

export default function ActivityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 flex flex-col items-center gap-4">
      <div className="text-destructive font-medium">
        Something went wrong
      </div>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
