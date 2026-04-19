import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Workflow } from '@/types/workflow';
import { getProjectRoot } from '@/lib/project-root';

export async function GET() {
  try {
    const workflowsDir = path.join(getProjectRoot(), '.nos', 'workflows');

    if (!fs.existsSync(workflowsDir)) {
      return NextResponse.json([]);
    }

    const folders = fs.readdirSync(workflowsDir);
    const workflows: Workflow[] = [];

    for (const folder of folders) {
      if (folder.startsWith('.') || !fs.statSync(path.join(workflowsDir, folder)).isDirectory()) {
        continue;
      }

      const configPath = path.join(workflowsDir, folder, 'config.json');
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          workflows.push({
            id: folder,
            name: config.name || folder
          });
        } catch (e) {
          console.error(`Error parsing config.json for workflow ${folder}:`, e);
        }
      }
    }

    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}
