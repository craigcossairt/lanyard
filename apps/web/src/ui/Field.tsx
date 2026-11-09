import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import { cx } from './cx';

interface FieldChrome {
  label: ReactNode;
  /** Keep the label for screen readers but hide it visually (only when a placeholder or icon makes the purpose obvious). */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
}

function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { fieldId, hintId, errorId, describedBy };
}

function Chrome({
  fieldId,
  hintId,
  errorId,
  label,
  hideLabel,
  hint,
  error,
  children,
}: FieldChrome & { fieldId: string; hintId?: string; errorId?: string; children: ReactNode }) {
  return (
    <div className="ly-field">
      <label htmlFor={fieldId} className={hideLabel ? 'ly-sr-only' : 'ly-field__label'}>
        {label}
      </label>
      {children}
      {hint && (
        <span id={hintId} className="ly-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="ly-field__error">
          <Icon name="warn" />
          {error}
        </span>
      )}
    </div>
  );
}

export type TextInputProps = FieldChrome & InputHTMLAttributes<HTMLInputElement>;

export function TextInput({
  label,
  hideLabel,
  hint,
  error,
  id,
  className,
  ...rest
}: TextInputProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Chrome {...ids} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <input
        id={ids.fieldId}
        className={cx('ly-input', className)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Chrome>
  );
}

export type TextAreaProps = FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({
  label,
  hideLabel,
  hint,
  error,
  id,
  className,
  rows = 3,
  ...rest
}: TextAreaProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Chrome {...ids} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <textarea
        id={ids.fieldId}
        rows={rows}
        className={cx('ly-input', className)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Chrome>
  );
}
