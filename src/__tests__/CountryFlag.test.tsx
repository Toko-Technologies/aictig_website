import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CountryFlag from '../components/CountryFlag';

describe('CountryFlag Component', () => {
  it('renders the bundled SVG flag for a valid ISO2 code', () => {
    render(<CountryFlag countryCode="KE" countryName="Kenya" />);
    const img = screen.getByRole('img', { name: 'Kenya' });
    expect(img).toHaveAttribute('src', '/flags/ke.svg');
  });

  it('renders Nigeria flag', () => {
    render(<CountryFlag countryCode="NG" />);
    expect(screen.getByRole('img', { name: 'NG' })).toHaveAttribute('src', '/flags/ng.svg');
  });

  it('renders South Africa flag', () => {
    render(<CountryFlag countryCode="ZA" />);
    expect(screen.getByRole('img', { name: 'ZA' })).toHaveAttribute('src', '/flags/za.svg');
  });

  it('renders with small size', () => {
    render(<CountryFlag countryCode="GH" size="sm" />);
    expect(screen.getByRole('img')).toHaveClass('h-[14px]');
  });

  it('renders with medium size', () => {
    render(<CountryFlag countryCode="GH" size="md" />);
    expect(screen.getByRole('img')).toHaveClass('h-5');
  });

  it('renders with large size', () => {
    render(<CountryFlag countryCode="GH" size="lg" />);
    expect(screen.getByRole('img')).toHaveClass('h-8');
  });

  it('handles lowercase country codes', () => {
    render(<CountryFlag countryCode="et" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/flags/et.svg');
  });

  it('falls back to a globe icon when there is no country code', () => {
    const { container } = render(<CountryFlag countryCode="" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Africa' })).toBeInTheDocument();
  });

  it('falls back to a globe icon when the flag image fails to load', () => {
    const { container } = render(<CountryFlag countryCode="XX" countryName="Unknown" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Unknown' })).toBeInTheDocument();
  });

  it('does not render emoji characters', () => {
    const { container } = render(<CountryFlag countryCode="NG" />);
    expect(container.textContent).toBe('');
  });
});
