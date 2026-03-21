import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SmartItemSelector, type SmartItemSelection } from './SmartItemSelector';

interface SmartItemSelectorButtonProps {
  companyId: string;
  onSelect: (selection: SmartItemSelection) => void;
  className?: string;
  label?: string;
}

export function SmartItemSelectorButton({
  companyId,
  onSelect,
  className = '',
  label = 'Use Smart Selector',
}: SmartItemSelectorButtonProps) {
  const [showSelector, setShowSelector] = useState(false);

  function handleSelect(selection: SmartItemSelection) {
    onSelect(selection);
    setShowSelector(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowSelector(true)}
        className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition shadow-sm ${className}`}
      >
        <Sparkles size={16} />
        {label}
      </button>

      {showSelector && (
        <SmartItemSelector
          companyId={companyId}
          onSelect={handleSelect}
          onCancel={() => setShowSelector(false)}
        />
      )}
    </>
  );
}
