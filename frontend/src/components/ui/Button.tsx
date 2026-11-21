'use client';

import { ReactNode } from 'react';
import { Button as ShadcnButton } from '@/components/shadcn/button';
import { Loader2 } from 'lucide-react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
  isLoading?: boolean;
}

const variantMap = {
  primary: 'default',
  secondary: 'outline',
  danger: 'destructive',
  ghost: 'ghost',
  success: 'default',
} as const;

const sizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const;

export default function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  fullWidth = false,
  isLoading = false,
}: ButtonProps) {
  const toneClass =
    variant === 'success'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
      : variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : '';

  return (
    <ShadcnButton
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={`${fullWidth ? 'w-full' : ''} ${toneClass} ${className}`}
    >
      {isLoading && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
      {children}
    </ShadcnButton>
  );
}
