import { CrisisDashboard } from '@/components/crisis/crisis-dashboard';
import { AlertCircle } from 'lucide-react';

export default function CrisisPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-7 w-7" />
                    Gestión de Crisis
                </h1>
                <p className="text-muted-foreground mt-1">
                    Centro de comando para caídas masivas y comunicación de contingencia.
                </p>
            </div>
            
            <CrisisDashboard />
        </div>
    );
}
