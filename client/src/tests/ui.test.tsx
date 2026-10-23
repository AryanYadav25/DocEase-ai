import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

describe('UI kit', () => {
  it('disables the button while loading', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('toggles password visibility and shows errors', () => {
    render(<Input label="Password" type="password" error="Too short" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByLabelText('Show password'));
    expect(input.type).toBe('text');
    expect(screen.getByRole('alert')).toHaveTextContent('Too short');
  });
});
