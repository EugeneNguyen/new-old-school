"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system');
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground">
            Overview of the local system tools and API health.
          </p>
        </div>
        <Button
          onClick={fetchStatus}
          disabled={isLoading}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            <CardDescription>Current API availability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={data?.status === 'online' ? 'success' : 'destructive'}>
                {data?.status || 'Unknown'}
              </Badge>
              <span className="text-lg font-semibold">{data?.status === 'online' ? 'Online' : 'Offline'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Version</CardTitle>
            <CardDescription>Current system version</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.version || 'N/A'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Updated</CardTitle>
            <CardDescription>Timestamp of the last check</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground font-mono">
              {data?.timestamp || 'Fetching...'}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
