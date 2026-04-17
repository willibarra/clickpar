import { getOwnedEmails } from '@/lib/actions/emails';
import { EmailsView } from '@/components/emails/emails-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';
import { ImapAccountsPanel } from '@/components/emails/imap-accounts-panel';

export default async function EmailsPage() {
    const emails = await getOwnedEmails();

    const total = emails.length;
    const libre = emails.filter(e => e.status === 'libre').length;
    const enUso = emails.filter(e => e.status === 'en_uso').length;
    const multiUso = emails.filter(e => e.status === 'multi_uso').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Correos Propios</h1>
                    <p className="text-muted-foreground">Inventario de correos electrónicos para registrar cuentas</p>
                </div>
            </div>

            {/* IMAP Accounts Section */}
            <ImapAccountsPanel />

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Mail className="h-4 w-4" /> Total Correos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{total}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-[#86EFAC]" /> Libres
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#86EFAC]">{libre}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" /> En Uso
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-500">{enUso}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <AlertOctagon className="h-4 w-4 text-red-500" /> Multi-Uso
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{multiUso}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Emails Table (Client Component) */}
            <EmailsView emails={emails} />
        </div>
    );
}
