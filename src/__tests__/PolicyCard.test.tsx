import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PolicyCard from '../components/PolicyCard';
import type { Policy } from '../types';

const mockPolicy: Policy = {
  id: 'test-1',
  title: 'Cybersecurity Act 2023',
  country: 'Kenya',
  countryCode: 'KE',
  region: 'East Africa',
  year: 2023,
  type: 'Policy',
  languages: ['en', 'sw'],
  summary: 'A comprehensive cybersecurity policy for Kenya',
  themes: ['Data Protection', 'Cyber Crime'],
  fileUrl: '/files/test.pdf',
  tags: ['cybersecurity', 'data-protection'],
};

describe('PolicyCard Component', () => {
  it('renders policy title', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    expect(screen.getByText('Cybersecurity Act 2023')).toBeInTheDocument();
  });

  // Country and year share one subtitle line: "Kenya • 2023".
  it('renders policy country in the subtitle', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    expect(screen.getByText(/^Kenya\s•\s2023$/)).toBeInTheDocument();
  });

  it('prefers the organization over the country in the subtitle', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={{ ...mockPolicy, organization: 'African Union' }} />
      </BrowserRouter>
    );
    expect(screen.getByText(/^African Union\s•\s2023$/)).toBeInTheDocument();
  });

  it('renders policy year in the subtitle', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    expect(screen.getByText(/•\s2023$/)).toBeInTheDocument();
  });

  it('renders policy summary', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    expect(
      screen.getByText('A comprehensive cybersecurity policy for Kenya')
    ).toBeInTheDocument();
  });

  it('renders download link', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    // Visible text is "PDF"; "Download PDF" is the tooltip.
    const downloadLink = screen.getByTitle('Download PDF');
    expect(downloadLink).toHaveAttribute('href', '/files/test.pdf');
    expect(downloadLink).toHaveAttribute('download');
  });

  it('renders a preview link that opens in a new tab', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    const previewLink = screen.getByTitle('Preview document');
    expect(previewLink).toHaveAttribute('href', '/files/test.pdf');
    expect(previewLink).toHaveAttribute('target', '_blank');
    expect(previewLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the list variant with title and download link', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} variant="list" />
      </BrowserRouter>
    );
    expect(screen.getByText('Cybersecurity Act 2023')).toBeInTheDocument();
    expect(screen.getByTitle('Download PDF')).toHaveAttribute('href', '/files/test.pdf');
  });

  it('renders country flag', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    expect(screen.getByText('🇰🇪')).toBeInTheDocument();
  });

  it('renders themes as tags', () => {
    render(
      <BrowserRouter>
        <PolicyCard policy={mockPolicy} />
      </BrowserRouter>
    );
    expect(screen.getByText('Data Protection')).toBeInTheDocument();
    expect(screen.getByText('Cyber Crime')).toBeInTheDocument();
  });
});
