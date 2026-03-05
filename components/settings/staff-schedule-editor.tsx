'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStaffSchedule, updateStaffSchedule, StaffScheduleData } from '@/lib/actions/attendance';
import { toast } from 'sonner';

interface StaffScheduleEditorProps {
    userId: string;
    userName: string;
}

const DAYS = [
    { key: 'monday', label: 'Lunes' },
    { key: 'tuesday', label: 'Martes' },
    { key: 'wednesday', label: 'Miércoles' },
    { key: 'thursday', label: 'Jueves' },
    { key: 'friday', label: 'Viernes' },
    { key: 'saturday', label: 'Sábado' },
    { key: 'sunday', label: 'Domingo' },
];

export function StaffScheduleEditor({ userId, userName }: StaffScheduleEditorProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schedule, setSchedule] = useState<Partial<StaffScheduleData>>({});

    useEffect(() => {
        async function fetchSchedule() {
            const data = await getStaffSchedule(userId);
            if (data) setSchedule(data);
            setLoading(false);
        }
        fetchSchedule();
    }, [userId]);

    const handleSave = async () => {
        setSaving(true);
        const result = await updateStaffSchedule({
            user_id: userId,
            ...schedule
        });

        if (result.error) {
            toast.error('Error al guardar el horario', { description: result.error });
        } else {
            toast.success('Horario actualizado', { description: `El horario de ${userName} ha sido guardado.` });
        }
        setSaving(false);
    };

    const handleChange = (day: string, type: 'start' | 'end', value: string) => {
        setSchedule(prev => ({
            ...prev,
            [`${day}_${type}`]: value
        }));
    };

    if (loading) {
        return (
            <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-[100px_1fr_auto_1fr] gap-4 items-center mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                <div>Día</div>
                <div>Entrada</div>
                <div></div>
                <div>Salida</div>
            </div>

            <div className="space-y-3">
                {DAYS.map(day => (
                    <div key={day.key} className="grid grid-cols-[100px_1fr_auto_1fr] gap-4 items-center">
                        <div className="text-sm font-medium text-foreground">{day.label}</div>
                        <Input
                            type="time"
                            value={(schedule as any)[`${day.key}_start`] || ''}
                            onChange={(e) => handleChange(day.key, 'start', e.target.value)}
                            className="bg-background"
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                            type="time"
                            value={(schedule as any)[`${day.key}_end`] || ''}
                            onChange={(e) => handleChange(day.key, 'end', e.target.value)}
                            className="bg-background"
                        />
                    </div>
                ))}
            </div>

            <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full mt-4 bg-primary text-primary-foreground"
                variant="secondary"
            >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar Horario
            </Button>
        </div>
    );
}
