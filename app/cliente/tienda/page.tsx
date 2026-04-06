'use client';

import { useEffect, useState } from 'react';
import {
    Loader2, AlertTriangle, ShoppingBag, Wallet, CheckCircle2,
    RefreshCw, ShoppingCart, X, Mail, Key
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';

interface Product {
    id: string;
    platform: string;
    sale_type: string;
    is_full_account: boolean;
    priceGs: number;
    availableSlots: number;
}

const PLATFORM_ICONS: Record<string, { emoji: string; gradient: string }> = {
    Netflix: { emoji: '🎬', gradient: 'from-red-900/60 to-red-800/40' },
    'HBO Max': { emoji: '💜', gradient: 'from-purple-900/60 to-purple-800/40' },
    'Disney+': { emoji: '🏰', gradient: 'from-blue-900/60 to-blue-800/40' },
    'Amazon Prime Video': { emoji: '📦', gradient: 'from-cyan-900/60 to-cyan-800/40' },
    'Prime Video': { emoji: '📦', gradient: 'from-cyan-900/60 to-cyan-800/40' },
    Spotify: { emoji: '🎧', gradient: 'from-green-900/60 to-green-800/40' },
    'YouTube Premium': { emoji: '▶️', gradient: 'from-red-900/60 to-red-700/40' },
    Crunchyroll: { emoji: '🍥', gradient: 'from-orange-900/60 to-orange-800/40' },
    VIX: { emoji: '📺', gradient: 'from-amber-900/60 to-amber-800/40' },
    'Paramount+': { emoji: '⛰️', gradient: 'from-blue-900/60 to-blue-900/40' },
    iCloud: { emoji: '☁️', gradient: 'from-sky-900/60 to-sky-800/40' },
};

function getProductTitle(product: Product) {
    let typeLab = '';
    if (product.is_full_account) typeLab = '(Cuenta Completa)';
    else if (product.sale_type === 'family') typeLab = '(Tipo Familia)';
    else typeLab = '(Por Perfiles)';
    return `${product.platform} ${typeLab}`;
}

interface ConfirmModalProps {
    product: Product;
    balance: number;
    onClose: () => void;
    onSuccess: (platform: string, isAsync: boolean) => void;
}

function ConfirmModal({ product, balance, onClose, onSuccess }: ConfirmModalProps) {
    const enough = balance >= product.priceGs;
    const icon = PLATFORM_ICONS[product.platform] || { emoji: '📱', gradient: 'from-gray-900/60 to-gray-800/40' };
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Family account async state
    const isAsync = product.sale_type === 'family' || product.is_full_account;
    const [step, setStep] = useState<1 | 2>(1);
    const [activationType, setActivationType] = useState<'own_email' | 'new_email'>('new_email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);

        try {
            if (isAsync) {
                // Async purchase
                const res = await fetch('/api/portal/store/comprar-async', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_id: product.id,
                        is_full_account: product.is_full_account,
                        activation_type: activationType,
                        email: email,
                        password: password
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    onSuccess(product.platform, true);
                } else {
                    setError(data.error || 'Error al procesar la compra.');
                }
            } else {
                // Normal purchase
                const res = await fetch('/api/portal/store/comprar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_id: product.id }),
                });
                const data = await res.json();
                if (data.success) {
                    onSuccess(product.platform, false);
                } else {
                    setError(data.error || 'Error al procesar la compra');
                }
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground">
                        {step === 1 ? 'Confirmar compra' : 'Datos de Activación'}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {step === 1 ? (
                    <>
                        {/* Product info */}
                        <div className={`flex items-center gap-4 rounded-xl bg-gradient-to-r ${icon.gradient} p-4 border border-white/10`}>
                            <span className="text-3xl">{icon.emoji}</span>
                            <div>
                                <p className="font-bold text-foreground">{getProductTitle(product)}</p>
                                <p className="text-xs text-muted-foreground">30 días de acceso</p>
                            </div>
                        </div>

                        {/* Balance check */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Precio</span>
                                <span className="font-semibold text-foreground">
                                    Gs. {product.priceGs.toLocaleString('es-PY')}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Tu saldo</span>
                                <span className={`font-semibold ${enough ? 'text-emerald-400' : 'text-red-400'}`}>
                                    Gs. {balance.toLocaleString('es-PY')}
                                </span>
                            </div>
                            {enough && (
                                <div className="flex items-center justify-between text-sm border-t border-border/50 pt-2">
                                    <span className="text-muted-foreground">Saldo restante</span>
                                    <span className="font-semibold text-foreground">
                                        Gs. {(balance - product.priceGs).toLocaleString('es-PY')}
                                    </span>
                                </div>
                            )}
                        </div>

                        {!enough && (
                            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                                <p className="text-xs text-red-400">
                                    Saldo insuficiente. Necesitás recargar al menos{' '}
                                    <strong>Gs. {(product.priceGs - balance).toLocaleString('es-PY')}</strong> más.
                                </p>
                            </div>
                        )}

                        {error && (
                            <p className="text-xs text-red-400 text-center">{error}</p>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (isAsync) setStep(2);
                                    else handleConfirm();
                                }}
                                disabled={!enough || loading}
                                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] py-2.5 text-sm font-semibold text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading && !isAsync ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                                {isAsync ? 'Continuar' : (loading ? 'Procesando…' : 'Confirmar')}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Step 2: Async Data for Family/Full accounts */}
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Estás comprando una cuenta <strong>{product.platform}</strong>. Este proceso requiere activación manual. ¿Querés usar tu propio correo o que te creemos uno nuevo?
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setActivationType('new_email')}
                                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                                        activationType === 'new_email'
                                            ? 'border-[#86EFAC] bg-[#86EFAC]/10 text-[#86EFAC]'
                                            : 'border-border bg-card text-muted-foreground hover:bg-muted'
                                    }`}
                                >
                                    Generar Correo Nuevo
                                </button>
                                <button
                                    onClick={() => setActivationType('own_email')}
                                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                                        activationType === 'own_email'
                                            ? 'border-[#86EFAC] bg-[#86EFAC]/10 text-[#86EFAC]'
                                            : 'border-border bg-card text-muted-foreground hover:bg-muted'
                                    }`}
                                >
                                    Usar Mi Propio Correo
                                </button>
                            </div>

                            {activationType === 'own_email' ? (
                                <div className="space-y-3 pt-2">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Correo de Spotify</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <input 
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="tu-correo@gmail.com"
                                                className="w-full rounded-xl border border-border bg-background px-9 py-2 text-sm text-foreground focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Contraseña</label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <input 
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Tu contraseña actual"
                                                className="w-full rounded-xl border border-border bg-background px-9 py-2 text-sm text-foreground focus:border-[#86EFAC] focus:outline-none focus:ring-1 focus:ring-[#86EFAC]"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-amber-400">
                                        Nosotros ingresaremos a tu cuenta para cambiarla a Premium. No compartas esta contraseña con nadie más.
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border bg-muted/30 p-4 pt-2 mt-4 space-y-2">
                                    <p className="text-sm text-foreground">El sistema autogenerará un correo con un dominio interno (ej: usuario@clickpar.shop) y una contraseña provisoria.</p>
                                    <p className="text-xs text-muted-foreground">Te notificaremos una vez que esté lista para usar.</p>
                                </div>
                            )}

                            {error && (
                                <p className="text-xs text-red-400 text-center">{error}</p>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={loading || (activationType === 'own_email' && (!email || !password))}
                                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] py-2.5 text-sm font-semibold text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                                    {loading ? 'Procesando…' : 'Comprar'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function TiendaPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const { balance: walletBalance, refreshBalance } = useWallet();
    const balance = walletBalance ?? 0;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Purchase flow
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [successMsg, setSuccessMsg] = useState<{title: string, desc: string} | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = () => {
        fetch('/api/portal/store')
            .then((r) => r.json())
            .then((storeData) => {
                if (storeData.success) setProducts(storeData.products);
                else setError(storeData.error || 'Error al cargar tienda');
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    };

    const handleSuccess = (platform: string, isAsync: boolean) => {
        setSelectedProduct(null);
        if (isAsync) {
            setSuccessMsg({
                title: `¡Solicitud de ${platform} recibida!`,
                desc: 'Tu cuenta estará activa en el correr del día. Te contactaremos vía WhatsApp.'
            });
        } else {
            setSuccessMsg({
                title: `¡${platform} activado!`,
                desc: 'Ya está disponible en tu sección de Servicios.'
            });
        }
        fetchData(); // reload store products
        refreshBalance(); // update balance in header + everywhere
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Tienda</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Comprá servicios de streaming con tu saldo disponible.
                    </p>
                </div>

                {/* Balance indicator */}
                <div className="flex items-center justify-between rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-[#86EFAC]">
                        <Wallet className="h-4 w-4" />
                        <span className="text-sm font-medium">Tu saldo</span>
                    </div>
                    <span className="text-sm font-bold text-[#86EFAC]">
                        Gs. {balance.toLocaleString('es-PY')}
                    </span>
                </div>

                {/* Success banner */}
                {successMsg && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
                        <div>
                            <p className="text-sm font-medium text-emerald-300">
                                {successMsg.title}
                            </p>
                            <p className="text-xs text-emerald-400/80">
                                {successMsg.desc}
                            </p>
                        </div>
                        <button
                            onClick={() => setSuccessMsg(null)}
                            className="ml-auto text-emerald-400/60 hover:text-emerald-400 transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* Product grid */}
                {products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card py-16 text-center">
                        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                        <div>
                            <p className="font-medium text-foreground">Sin productos disponibles</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Próximamente tendremos más servicios en la tienda.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {products.map((product) => {
                            const icon = PLATFORM_ICONS[product.platform] || { emoji: '📱', gradient: 'from-gray-900/60 to-gray-800/40' };
                            const canAfford = balance >= product.priceGs;
                            const hasSlots = product.availableSlots > 0;

                            return (
                                <div
                                    key={`${product.id}-${product.sale_type}-${product.is_full_account}`}
                                    className="overflow-hidden rounded-2xl border border-border/50 bg-card transition-all hover:border-border flex flex-col"
                                >
                                    {/* Platform header */}
                                    <div className={`bg-gradient-to-br ${icon.gradient} px-5 py-5`}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-3xl">{icon.emoji}</span>
                                            <div>
                                                <h3 className="text-lg font-bold text-foreground line-clamp-1">{getProductTitle(product)}</h3>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="p-4 space-y-3 flex-1 flex flex-col">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">Precio</span>
                                            <span className="text-lg font-bold text-foreground">
                                                Gs. {product.priceGs.toLocaleString('es-PY')}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">Disponibilidad</span>
                                            <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${hasSlots
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'bg-muted text-muted-foreground'
                                                }`}>
                                                {hasSlots ? `${product.availableSlots} disponible${product.availableSlots !== 1 ? 's' : ''}` : 'Sin stock'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex-1"></div>

                                        <button
                                            onClick={() => {
                                                setSelectedProduct(product);
                                            }}
                                            disabled={!hasSlots}
                                            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 mt-2 ${hasSlots
                                                ? canAfford
                                                    ? 'bg-gradient-to-r from-[#86EFAC] to-[#6EE7B7] text-black hover:opacity-90'
                                                    : 'border border-[#86EFAC]/40 bg-[#86EFAC]/10 text-[#86EFAC] hover:bg-[#86EFAC]/20'
                                                : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
                                                }`}
                                        >
                                            <ShoppingCart className="h-4 w-4" />
                                            {!hasSlots
                                                ? 'Sin stock'
                                                : canAfford
                                                    ? 'Comprar con Saldo'
                                                    : 'Saldo insuficiente'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Confirmation modal */}
            {selectedProduct && (
                <ConfirmModal
                    product={selectedProduct}
                    balance={balance}
                    onClose={() => setSelectedProduct(null)}
                    onSuccess={handleSuccess}
                />
            )}
        </>
    );
}
