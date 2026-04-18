import skillsConfig from '@/config/skills.json';
import { SkillDefinition } from '@/types/skill';

export const SkillRegistry = {
  getAllSkills(): SkillDefinition[] {
    return skillsConfig as SkillDefinition[];
  },

  getSkillById(id: string): SkillDefinition | undefined {
    return (skillsConfig as SkillDefinition[]).find(s => s.id === id);
  },

  searchSkills(query: string): SkillDefinition[] {
    const q = query.toLowerCase().replace(/^\//, '');
    if (!q) return this.getAllSkills();
    return this.getAllSkills().filter(
      s => s.id.startsWith(q) || s.name.toLowerCase().includes(q)
    );
  },
};
