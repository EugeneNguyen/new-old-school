import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getTemplatesRoot } from '@/lib/scaffolding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TemplateConfig {
  name: string;
  idPrefix: string;
}

interface StageConfig {
  name: string;
  description?: string;
  prompt?: string | null;
  autoAdvanceOnComplete?: boolean | null;
  agentId?: string | null;
}

interface StagesYaml {
  stages: StageConfig[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templatesRoot = path.join(getTemplatesRoot(), '.nos', 'workflows');
    const templateDir = path.join(templatesRoot, id);
    const configPath = path.join(templateDir, 'config.json');

    if (!fs.existsSync(configPath)) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as TemplateConfig;
    const stagesPath = path.join(templateDir, 'config', 'stages.yaml');
    const stages: StageConfig[] = [];

    if (fs.existsSync(stagesPath)) {
      try {
        const stagesContent = fs.readFileSync(stagesPath, 'utf-8');
        const parsed = yaml.load(stagesContent) as StagesYaml;
        if (parsed?.stages) {
          stages.push(...parsed.stages);
        }
      } catch {
        // Return empty stages on parse error
      }
    }

    return NextResponse.json({
      id,
      name: config.name || id,
      idPrefix: config.idPrefix || '',
      stages,
    });
  } catch (error) {
    console.error('Error fetching template detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}