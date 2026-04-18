'use client';

import { useEffect, useRef } from 'react';
import type { SkillDefinition } from '@/types/skill';

interface SlashPopupProps {
  skills: SkillDefinition[];
  activeIndex: number;
  onSelect: (skill: SkillDefinition) => void;
}

export default function SlashPopup({ skills, activeIndex, onSelect }: SlashPopupProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <ul
      ref={listRef}
      id="slash-popup"
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg max-h-64 overflow-y-auto"
    >
      {skills.map((skill, index) => (
        <li
          key={skill.id}
          id={`slash-option-${skill.id}`}
          data-index={index}
          role="option"
          aria-selected={index === activeIndex}
          onClick={() => onSelect(skill)}
          className={`px-3 py-2 cursor-pointer text-sm font-mono ${
            index === activeIndex
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-800/50'
          } ${index > 0 ? 'border-t border-zinc-800/50' : ''}`}
        >
          <span className="text-zinc-100 font-medium">{skill.name}</span>
          <span className="ml-2 text-zinc-500 text-xs">{skill.description}</span>
        </li>
      ))}
    </ul>
  );
}
