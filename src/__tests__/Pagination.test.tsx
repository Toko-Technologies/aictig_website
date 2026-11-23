import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import Pagination from '../components/Pagination';

// The buttons are labelled by their on-screen, translated text
// (common:actions.previous / actions.next), so load the real English strings.
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('Pagination Component', () => {
  it('renders current page and total pages', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);
    const prevButton = screen.getByRole('button', { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={() => {}} />);
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('enables both buttons on middle page', () => {
    render(<Pagination currentPage={3} totalPages={5} onPageChange={() => {}} />);
    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(prevButton).not.toBeDisabled();
    expect(nextButton).not.toBeDisabled();
  });

  it('calls onPageChange with correct page when clicking next', () => {
    let page = 1;
    const handlePageChange = (newPage: number) => {
      page = newPage;
    };
    render(
      <Pagination currentPage={page} totalPages={5} onPageChange={handlePageChange} />
    );
    
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);
    
    expect(page).toBe(2);
  });

  it('calls onPageChange with correct page when clicking previous', () => {
    let page = 3;
    const handlePageChange = (newPage: number) => {
      page = newPage;
    };
    render(
      <Pagination currentPage={page} totalPages={5} onPageChange={handlePageChange} />
    );
    
    const prevButton = screen.getByRole('button', { name: /previous/i });
    fireEvent.click(prevButton);
    
    expect(page).toBe(2);
  });

  it('marks only the current page with aria-current and the active style', () => {
    render(<Pagination currentPage={3} totalPages={5} onPageChange={() => {}} />);
    const currentPageButton = screen.getByRole('button', { name: '3' });
    expect(currentPageButton).toHaveAttribute('aria-current', 'page');
    expect(currentPageButton).toHaveClass('bg-primary-50');

    const otherPageButton = screen.getByRole('button', { name: '2' });
    expect(otherPageButton).not.toHaveAttribute('aria-current');
    expect(otherPageButton).not.toHaveClass('bg-primary-50');
  });

  it('calls onPageChange with the clicked page number', () => {
    let page = 1;
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={(p) => { page = p; }} />
    );
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(page).toBe(4);
  });

  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders ellipsis for large page counts', () => {
    render(<Pagination currentPage={5} totalPages={20} onPageChange={() => {}} />);
    const ellipsis = screen.getAllByText('...');
    expect(ellipsis.length).toBeGreaterThan(0);
  });
});
