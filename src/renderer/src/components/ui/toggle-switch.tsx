import React from 'react'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  size = 'md'
}) => {
  const sizes = {
    sm: {
      container: 'w-8 h-4',
      thumb: 'w-3 h-3',
      translate: 'translate-x-4'
    },
    md: {
      container: 'w-11 h-6',
      thumb: 'w-5 h-5',
      translate: 'translate-x-5'
    },
    lg: {
      container: 'w-14 h-8',
      thumb: 'w-6 h-6',
      translate: 'translate-x-6'
    }
  }

  const currentSize = sizes[size]

  return (
    <div className="flex items-center space-x-2">
      {label && (
        <label className="text-sm font-medium text-gray-700 cursor-pointer">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`
          relative inline-flex ${currentSize.container} items-center rounded-full 
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${checked 
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg' 
            : 'bg-gray-200 hover:bg-gray-300'
          }
        `}
      >
        <span className="sr-only">Toggle</span>
        <div
          className={`
            ${currentSize.thumb} bg-white rounded-full shadow-lg transform transition-transform duration-200 ease-in-out
            ${checked ? currentSize.translate : 'translate-x-0.5'}
          `}
        />
      </button>
    </div>
  )
} 