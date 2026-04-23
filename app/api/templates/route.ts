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

function readTemplateStageNames(templateDir: string): string[] {
  const stagesPath = path.join(templateDir, 'config', 'stages.yaml');
  if (!fs.existsSync(stagesPath)) return [];
  try {
    const content = fs.readFileSync(stagesPath, 'utf-8');
    const parsed = yaml.load(content) as StagesYaml;
    return parsed?.stages?.map((s) => s.name) ?? [];
  } catch {
    return [];
  }
}

function getTemplateListItem(templateId: string) {
  const templateDir = path.join(getTemplatesRoot(), '.nos', 'workflows', templateId);
  const configPath = path.join(templateDir, 'config.json');

  if (!fs.existsSync(configPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as TemplateConfig;
    const stages = readTemplateStageNames(templateDir);

    return {
      id: templateId,
      name: config.name || templateId,
      idPrefix: config.idPrefix || '',
      stageCount: stages.length,
      stages,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const templatesRoot = path.join(getTemplatesRoot(), '.nos', 'workflows');

    if (!fs.existsSync(templatesRoot)) {
      return NextResponse.json([]);
    }

    const entries = fs.readdirSync(templatesRoot, { withFileTypes: true });
    const templates = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const item = getTemplateListItem(entry.name);
      if (item) {
        templates.push(item);
      }
    }

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}