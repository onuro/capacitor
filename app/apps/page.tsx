'use client';

import { AppList } from '@/components/apps/app-list';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Box } from 'lucide-react';

export default function AppsPage() {
  return (
    <main className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Box className="size-8" />
            My Apps
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your deployed applications on FluxCloud
          </p>
        </div>
        <Button asChild>
          <Link href="/register">
            <Plus className="size-4" />
            Deploy New App
          </Link>
        </Button>
      </div>

      <AppList />
    </main>
  );
}
