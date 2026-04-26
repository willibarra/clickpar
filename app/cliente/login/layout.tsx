import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Acceso de Clientes de Clickpar',
    description: 'Ingresá a tu portal de cliente en ClickPar para gestionar tus servicios de streaming, renovar y más.',
    openGraph: {
        title: 'Acceso de Clientes de Clickpar',
        description: 'Ingresá a tu portal de cliente en ClickPar para gestionar tus servicios de streaming, renovar y más.',
        url: 'https://clickpar.net/cliente/login',
        siteName: 'clickpar.net',
        images: [
            {
                url: 'https://clickpar.net/clickpar-og.jpg',
                width: 1024,
                height: 1024,
                alt: 'ClickPar Logo',
            },
        ],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Acceso de Clientes de Clickpar',
        description: 'Ingresá a tu portal de cliente en ClickPar para gestionar tus servicios de streaming.',
        images: ['https://clickpar.net/clickpar-og.jpg'],
    },
};

export default function LoginLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
