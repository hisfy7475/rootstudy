'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import type { MockExamOptionGroupInput, MockExamOptionGroupWithOptions } from '@/lib/actions/meal';

export type OptionEditorValue = {
  /** null = 신규, string = 기존 group id. */
  id: string | null;
  /** React key 안정성을 위한 클라이언트 키. */
  clientKey: string;
  name: string;
  is_required: boolean;
  options: Array<{
    id: string | null;
    clientKey: string;
    name: string;
  }>;
};

let clientKeyCounter = 0;
function makeKey(): string {
  clientKeyCounter += 1;
  return `k-${Date.now()}-${clientKeyCounter}`;
}

export function optionEditorValueFromServer(
  groups: MockExamOptionGroupWithOptions[],
): OptionEditorValue[] {
  return groups.map((g) => ({
    id: g.id,
    clientKey: makeKey(),
    name: g.name,
    is_required: g.is_required,
    options: g.options.map((o) => ({
      id: o.id,
      clientKey: makeKey(),
      name: o.name,
    })),
  }));
}

export function optionEditorValueToInput(value: OptionEditorValue[]): MockExamOptionGroupInput[] {
  return value
    .map((g, gi) => ({
      id: g.id,
      name: g.name.trim(),
      sort_order: gi,
      is_required: g.is_required,
      status: 'active' as const,
      options: g.options
        .map((o, oi) => ({
          id: o.id,
          name: o.name.trim(),
          sort_order: oi,
          status: 'active' as const,
        }))
        .filter((o) => o.name.length > 0),
    }))
    .filter((g) => g.name.length > 0);
}

interface Props {
  value: OptionEditorValue[];
  onChange: (next: OptionEditorValue[]) => void;
}

export function MockExamOptionEditor({ value, onChange }: Props) {
  const headerId = useId();

  const addGroup = () => {
    onChange([
      ...value,
      {
        id: null,
        clientKey: makeKey(),
        name: '',
        is_required: true,
        options: [{ id: null, clientKey: makeKey(), name: '' }],
      },
    ]);
  };

  const removeGroup = (gi: number) => {
    onChange(value.filter((_, i) => i !== gi));
  };

  const patchGroup = (gi: number, patch: Partial<OptionEditorValue>) => {
    onChange(value.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  };

  const addOption = (gi: number) => {
    onChange(
      value.map((g, i) =>
        i === gi
          ? { ...g, options: [...g.options, { id: null, clientKey: makeKey(), name: '' }] }
          : g,
      ),
    );
  };

  const removeOption = (gi: number, oi: number) => {
    onChange(
      value.map((g, i) => (i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g)),
    );
  };

  const patchOption = (gi: number, oi: number, name: string) => {
    onChange(
      value.map((g, i) =>
        i === gi
          ? {
              ...g,
              options: g.options.map((o, j) => (j === oi ? { ...o, name } : o)),
            }
          : g,
      ),
    );
  };

  return (
    <div className='space-y-3' aria-labelledby={headerId}>
      <div className='flex items-center justify-between'>
        <label id={headerId} className='block text-sm font-medium'>
          응시 옵션 (선택)
        </label>
        <button
          type='button'
          onClick={addGroup}
          className='text-primary hover:bg-primary/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs'
        >
          <Plus className='size-3.5' /> 옵션 그룹 추가
        </button>
      </div>

      {value.length === 0 && (
        <p className='text-muted-foreground text-xs'>
          옵션 그룹을 추가하지 않으면 옵션 없는 모의고사로 등록됩니다 (예: 이감 모의고사).
        </p>
      )}

      {value.map((g, gi) => (
        <div key={g.clientKey} className='border-input bg-muted/30 space-y-3 rounded-md border p-3'>
          <div className='flex items-center gap-2'>
            <Input
              value={g.name}
              onChange={(e) => patchGroup(gi, { name: e.target.value })}
              placeholder='그룹명 (예: 유형, 영역)'
              className='bg-background flex-1'
            />
            <label className='inline-flex shrink-0 items-center gap-1 text-xs'>
              <input
                type='checkbox'
                checked={g.is_required}
                onChange={(e) => patchGroup(gi, { is_required: e.target.checked })}
              />
              필수
            </label>
            <button
              type='button'
              onClick={() => removeGroup(gi)}
              className='text-muted-foreground hover:text-destructive rounded-md p-1'
              aria-label='그룹 삭제'
            >
              <X className='size-4' />
            </button>
          </div>

          <div className='space-y-2 pl-2'>
            {g.options.map((o, oi) => (
              <div key={o.clientKey} className='flex items-center gap-2'>
                <Input
                  value={o.name}
                  onChange={(e) => patchOption(gi, oi, e.target.value)}
                  placeholder='옵션명 (예: 현장, 과탐)'
                  className='bg-background flex-1'
                />
                <button
                  type='button'
                  onClick={() => removeOption(gi, oi)}
                  className='text-muted-foreground hover:text-destructive rounded-md p-1'
                  aria-label='옵션 삭제'
                >
                  <X className='size-4' />
                </button>
              </div>
            ))}
            <button
              type='button'
              onClick={() => addOption(gi)}
              className='text-primary hover:bg-primary/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs'
            >
              <Plus className='size-3.5' /> 옵션 추가
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
