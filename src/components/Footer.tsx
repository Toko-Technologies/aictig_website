import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// Transparent variant with white lettering, made for the dark footer.
import aictigLogo from '../img/aictig_logo_dark.png';
import { getSocialLinks } from '../utils/socialLinks';
import { getSiteSettings } from '../content/siteContent';

export default function Footer() {
  const { t } = useTranslation('common');
  const currentYear = new Date().getFullYear();
  const socialLinks = getSocialLinks('h-6 w-6');
  const { contactEmails } = getSiteSettings();
  
  const quickLinks = [
    { name: t('navigation.home'), href: '/' },
    { name: t('navigation.about'), href: '/about' },
    { name: t('navigation.focusAreas'), href: '/focus-areas' },
    { name: t('navigation.consultancy'), href: '/consultancy' },
    { name: t('navigation.repository'), href: '/repository' },
    { name: t('navigation.publications'), href: '/publications' },
    { name: t('navigation.contact'), href: '/contact' },
  ];
  
  return (
    <footer className="bg-neutral-900 text-neutral-300" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="container-custom py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About & Logo */}
          <div className="lg:col-span-1">
            <img
              src={aictigLogo}
              alt="AICTiG Logo"
              width={348}
              height={498}
              loading="lazy"
              className="h-24 md:h-28 w-auto mb-4"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h3 className="text-white text-base font-semibold mb-2">{t('footer.fullName')}</h3>
            <p className="text-sm text-neutral-400">{t('footer.tagline')}</p>
            
            {/* Social Media */}
            <div className="flex space-x-4 mt-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.url}
                  className="text-neutral-400 hover:text-primary-500 transition-colors focus-ring rounded"
                  aria-label={social.name}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>
          
          {/* Quick Links */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.quickLinks')}</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm hover:text-primary-500 transition-colors focus-ring rounded"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Contact Info - Nigeria Office */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.nigeriaOffice')}</h3>
            <address className="not-italic text-sm space-y-2 text-neutral-400">
              {t('footer.nigeriaAddress').split('\n').map((line, index) => {
                const match = line.match(/^([^:]+):\s*(.+)$/);
                if (match) {
                  return (
                    <p key={index}>
                      <span className="font-semibold text-white">{match[1]}:</span> {match[2]}
                    </p>
                  );
                }
                return <p key={index}>{line}</p>;
              })}
            </address>
          </div>
          
          {/* Contact Info - South Africa Office & Email */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.southAfricaOffice')}</h3>
            <address className="not-italic text-sm space-y-3 text-neutral-400">
              <p>{t('footer.southAfricaAddress')}</p>
              {contactEmails.length > 0 && (
                <div className="pt-3 border-t border-neutral-800">
                  <p className="font-medium text-white mb-1">{t('footer.email')}</p>
                  {contactEmails.map((email) => (
                    <a
                      key={email}
                      href={`mailto:${email}`}
                      className="block text-primary-500 hover:text-primary-400 transition-colors focus-ring rounded w-fit"
                    >
                      {email}
                    </a>
                  ))}
                </div>
              )}
            </address>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-neutral-800">
          <div className="flex flex-col md:flex-row justify-between items-center text-sm text-neutral-400">
            <p>{t('footer.copyright', { year: currentYear })}</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <Link to="/legal/privacy" className="hover:text-primary-500 transition-colors focus-ring rounded">
                {t('footer.privacy')}
              </Link>
              <Link to="/legal/terms" className="hover:text-primary-500 transition-colors focus-ring rounded">
                {t('footer.terms')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
