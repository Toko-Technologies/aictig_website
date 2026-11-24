import { Link } from 'react-router-dom';
import { ChevronRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { contentSchema } from '../schema';
import { Card, PageHeader } from '../ui';

export default function PagesIndexPage() {
  return (
    <>
      <PageHeader
        title="Website pages"
        description="Change the texts on the website’s pages: headings, introductions, buttons and the footer. Choose a page to start."
      />
      <Card>
        <ul className="-mx-6 -my-5 divide-y divide-neutral-100">
          {contentSchema.pages.map((page) => {
            const count = page.sections.reduce((n, s) => n + s.fields.length, 0);
            return (
              <li key={page.id}>
                <Link to={`/admin/pages/${page.id}`} className="group flex items-center gap-4 px-6 py-4 hover:bg-neutral-50">
                  <DocumentTextIcon className="h-6 w-6 flex-shrink-0 text-primary-600" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">{page.label}</p>
                    <p className="mt-0.5 text-sm text-neutral-500">{page.description}</p>
                  </div>
                  <span className="hidden text-xs text-neutral-400 sm:block">{count} texts</span>
                  <ChevronRightIcon className="h-5 w-5 text-neutral-300 group-hover:text-neutral-500" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
