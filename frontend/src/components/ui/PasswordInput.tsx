import { useState } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & {
  leadingIcon?: ReactNode;
};

export function PasswordInput({ leadingIcon, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      {leadingIcon}
      <input {...inputProps} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={inputProps.id}
        onClick={() => setVisible(current => !current)}
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}
