import type { ReactNode } from 'react';

interface DocumentLayoutProps {
  title: ReactNode;
  relations: ReactNode;
  children: ReactNode;
}

export default function DocumentLayout({
  title,
  relations,
  children,
}: DocumentLayoutProps) {
  return (
    <main className="document-layout">
      <article className="document-content">
        <header>
          <h1 className="document-title">{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 34 }}>
            {relations}
          </div>
        </header>

        <section className="document-body" aria-label="본문">
          {children}
        </section>
      </article>
    </main>
  );
}
