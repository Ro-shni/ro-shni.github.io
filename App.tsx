
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BlogPost, Category, ViewState, BlockType, ContentBlock, SiteSettings, User, Comment } from './types';
import { Icons } from './components/Icons';
import { BlockEditor } from './components/BlockEditor';
import { generateBlogContent, suggestTitle } from './services/geminiService';
import * as db from './services/mockFirebase';
import { auth } from './services/firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { send } from '@emailjs/browser';

// --- Constants ---
const CATEGORY_CONFIG: Record<Category, { color: string, icon: any }> = {
  [Category.Food]: { color: 'bg-emerald-100 text-emerald-800', icon: Icons.Coffee },
  [Category.Travel]: { color: 'bg-sky-100 text-sky-800', icon: Icons.Plane },
  [Category.Fashion]: { color: 'bg-rose-100 text-rose-800', icon: Icons.Camera },
  [Category.Technology]: { color: 'bg-indigo-100 text-indigo-800', icon: Icons.Smartphone },
  [Category.Lifestyle]: { color: 'bg-orange-100 text-orange-800', icon: Icons.Globe },
  [Category.Journal]: { color: 'bg-stone-200 text-stone-800', icon: Icons.FileText },
};


// Updated image paths - using public folder with base URL for GitHub Pages compatibility
const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&q=80&w=1920';
const DEFAULT_ABOUT_IMAGE = import.meta.env.BASE_URL + 'profile.jpeg';
const DEFAULT_SIGNATURE_IMAGE = import.meta.env.BASE_URL + 'signature.png';

const MOCK_POSTS: BlogPost[] = [
  {
    id: '1',
    title: 'The Art of Slow Living in Kyoto',
    excerpt: 'Discovering peace in the ancient capital through tea ceremonies and hidden gardens.',
    coverImage: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=800', 
    category: Category.Travel,
    tags: ['Japan', 'Mindfulness', 'Travel'],
    author: 'Roshni',
    publishedAt: new Date().toISOString(),
    status: 'published',
    views: 1240,
    blocks: [
      { id: 'b1', type: BlockType.Heading1, content: 'Arrival in Arashiyama', width: 100 },
      { id: 'b2', type: BlockType.Paragraph, content: 'The morning mist clung to the mountains as we stepped off the train. Kyoto feels different—time moves slower here.', width: 100 },
      { id: 'b3', type: BlockType.Image, content: '', src: 'https://images.unsplash.com/photo-1624253321171-1be53e12f5f4?auto=format&fit=crop&q=80&w=800', width: 100 },
      { id: 'b4', type: BlockType.Quote, content: 'Beauty lies in the spaces between things.', width: 100 },
    ]
  },
  {
    id: '2',
    title: 'Minimalist Wardrobe Essentials',
    excerpt: 'Building a capsule wardrobe that lasts a lifetime with just 20 items.',
    coverImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=800', 
    category: Category.Fashion,
    tags: ['Style', 'Sustainable', 'Minimalism'],
    author: 'Roshni',
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'published',
    views: 850,
    blocks: [
        { id: 'b1', type: BlockType.Paragraph, content: 'Fast fashion is out. Timeless pieces are in.', width: 100 },
    ]
  }
];

// --- Shared Components ---

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
            <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
            <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
            <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
            <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
        </g>
    </svg>
);

const NotificationToast = ({ message, onClose }: { message: string | null, onClose: () => void }) => {
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(onClose, 4000);
        return () => clearTimeout(t);
    }, [message, onClose]);

    if (!message) return null;

    const isError = /failed|error/i.test(message);

    return (
        <div className="fixed bottom-6 right-6 z-[100] bg-stone-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-up">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${isError ? 'bg-red-500' : 'bg-emerald-500 text-stone-900'}`}>
                {isError ? <Icons.X size={16} /> : <Icons.Check size={16} />}
            </div>
            <p className="font-medium text-sm">{message}</p>
            <button onClick={onClose} className="ml-2 text-stone-500 hover:text-white"><Icons.X size={14}/></button>
        </div>
    );
};

const Header: React.FC<{
    view: ViewState;
    setView: (v: ViewState) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    onOpenNewsletter: () => void;
    user: User | null;
    onLogout: () => void;
  }> = ({ view, setView, searchQuery, setSearchQuery, onOpenNewsletter, user, onLogout }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
  
    return (
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-stone-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
              <button onClick={() => setView({ type: 'home' })} className="text-2xl font-serif font-bold tracking-tighter hover:opacity-70 transition-opacity">
                  Ro-shines
              </button>
              <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-500">
                  <button onClick={() => setView({ type: 'home' })} className={`hover:text-stone-900 transition-colors ${view.type === 'home' ? 'text-stone-900' : ''}`}>Stories</button>
                  <button onClick={() => setView({ type: 'about' })} className={`hover:text-stone-900 transition-colors ${view.type === 'about' ? 'text-stone-900' : ''}`}>About</button>
                  {user?.isAdmin && (
                      <button onClick={() => setView({ type: 'admin-dashboard' })} className={`hover:text-stone-900 transition-colors ${view.type.startsWith('admin') ? 'text-stone-900' : ''}`}>Dashboard</button>
                  )}
              </nav>
          </div>
  
          <div className="flex items-center gap-4">
               <div className="relative hidden md:block group">
                  <Icons.Search className="absolute left-3 top-2.5 text-stone-400 group-focus-within:text-stone-600 transition-colors" size={16} />
                  <input 
                      type="text" 
                      placeholder="Search stories..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-stone-100/50 hover:bg-stone-100 focus:bg-white border border-transparent focus:border-stone-200 rounded-full text-sm outline-none transition-all w-48 focus:w-64"
                  />
               </div>
  
               {user ? (
                   <div className="flex items-center gap-3 pl-4 border-l border-stone-200">
                      <span className="text-sm font-medium hidden md:block">{user.name}</span>
                      <button onClick={onLogout} className="text-xs text-stone-500 hover:text-red-600 underline">Logout</button>
                   </div>
               ) : (
                  <button onClick={() => setView({ type: 'login' })} className="text-sm font-bold hover:text-stone-600 px-3 py-2">Login</button>
               )}
  
               <button onClick={onOpenNewsletter} className="bg-stone-900 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-stone-700 transition-colors shadow-lg hover:shadow-xl hidden md:block">
                  Subscribe
               </button>
  
               <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                  {isMenuOpen ? <Icons.X /> : <Icons.Menu />}
               </button>
          </div>
        </div>
        
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-stone-100 p-6 flex flex-col gap-4 shadow-xl animate-fade-in">
               <input 
                  type="text" 
                  placeholder="Search..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-3 bg-stone-50 rounded-xl text-sm mb-2"
              />
              <button onClick={() => { setView({ type: 'home' }); setIsMenuOpen(false); }} className="text-left font-serif text-xl">Stories</button>
              <button onClick={() => { setView({ type: 'about' }); setIsMenuOpen(false); }} className="text-left font-serif text-xl">About</button>
              {user?.isAdmin && <button onClick={() => { setView({ type: 'admin-dashboard' }); setIsMenuOpen(false); }} className="text-left font-serif text-xl">Dashboard</button>}
               <hr className="border-stone-100" />
               <button onClick={onOpenNewsletter} className="w-full bg-stone-900 text-white py-3 rounded-xl font-bold">Subscribe</button>
          </div>
        )}
      </header>
    );
};

const Footer = ({ onOpenNewsletter, onNavigate }: { onOpenNewsletter: () => void, onNavigate: (view: ViewState) => void }) => (
    <footer className="bg-stone-900 text-stone-400 py-16">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-2">
                <h3 className="text-2xl font-serif text-white mb-6">Ro-shines</h3>
                <p className="max-w-xs mb-8 leading-relaxed">
                    A digital sanctuary for thoughtful living, design, and culture.
                    Crafted with intention.
                </p>
                <p className="text-xs">© 2026 Ro-shines. All rights reserved.</p>
            </div>
            <div>
                <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Explore</h4>
                <ul className="space-y-4 text-sm">
                    <li><button onClick={() => onNavigate({ type: 'home' })} className="hover:text-white cursor-pointer transition-colors text-left">Home</button></li>
                    <li><button onClick={() => onNavigate({ type: 'about' })} className="hover:text-white cursor-pointer transition-colors text-left">About</button></li>
                </ul>
            </div>
            <div>
                 <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-xs">Newsletter</h4>
                 <p className="text-sm mb-4">Get the latest stories delivered to your inbox.</p>
                 <button onClick={onOpenNewsletter} className="text-white underline hover:text-stone-200">Subscribe Now</button>
            </div>
        </div>
    </footer>
);

const NewsletterModal = ({ isOpen, onClose, onSubscribe, currentUser }: { isOpen: boolean, onClose: () => void, onSubscribe: (email: string) => void, currentUser: User | null }) => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'already_subscribed'>('idle');
    const [emailError, setEmailError] = useState<string | null>(null);
    const form = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (currentUser?.email) {
            setEmail(currentUser.email);
        }
    }, [currentUser, isOpen]);

    // Reset status when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setEmailError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;
    
    const parseError = (error: any): string => {
        if (typeof error === 'string') return error;
        if (error?.text) return error.text;
        if (error?.message) return error.message;
        try {
            return JSON.stringify(error);
        } catch {
            return 'Unknown error occurred';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!email) return;
        setStatus('sending');
        
        try {
            const result = await db.subscribeUser(email);

            if (result.isNewSubscriber) {
                // Only send welcome email for new subscribers
                const templateParams = {
                    email: email,
                    to_name: 'Subscriber',
                    from_name: 'Ro-shines',
                    message: 'Welcome to the Ro-shines community!'
                };
                
                await send(
                    import.meta.env.VITE_EMAILJS_SERVICE_ID,
                    import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
                    templateParams,
                    { publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY }
                );
                console.log('Email sent successfully via EmailJS');

                onSubscribe(email);
                setStatus('success');
            } else {
                // User is already subscribed
                setStatus('already_subscribed');
            }
        } catch (error: any) {
            console.error('EmailJS Failed:', error);
            const errorText = parseError(error);
            setStatus('idle');
            // Show inline error below the form
            setEmailError(`Failed to send confirmation email: ${errorText}`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
                <button onClick={onClose} className="absolute right-4 top-4 text-stone-400 hover:text-stone-600"><Icons.X size={20}/></button>
                
                {status === 'success' ? (
                     <div className="text-center animate-fade-in">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                            <Icons.Check size={32} />
                        </div>
                        <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">Welcome Aboard!</h3>
                        <p className="text-stone-500 mb-6">We've sent a warm welcome letter to <b>{email}</b>.</p>
                     </div>
                ) : status === 'already_subscribed' ? (
                    <div className="text-center animate-fade-in">
                        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-600">
                            <Icons.Check size={32} />
                        </div>
                        <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">Already Subscribed!</h3>
                        <p className="text-stone-500 mb-6">You're already part of the Ro-shines community. Thank you for your continued support!</p>
                        <button onClick={onClose} className="w-full bg-stone-900 text-white font-bold py-3 rounded-xl hover:bg-stone-800 transition-colors">
                            Close
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-900">
                                <Icons.Send size={24} />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">Join the Community</h3>
                            <p className="text-stone-500">Weekly stories, curated links, and design inspiration.</p>
                        </div>
                        <form ref={form} onSubmit={handleSubmit}>
                            <input 
                                type="email" 
                                name="email"
                                placeholder="your@email.com" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-3 outline-none focus:border-stone-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                required
                                disabled={status === 'sending' || !!currentUser}
                            />
                            
                            <button type="submit" disabled={status === 'sending'} className="w-full bg-stone-900 text-white font-bold py-3 rounded-xl hover:bg-stone-800 transition-transform active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2">
                                {status === 'sending' ? (
                                    <>Processing...</>
                                ) : 'Subscribe'}
                            </button>
                            {emailError && (
                                <p className="mt-3 text-sm text-red-600 text-center">{emailError}</p>
                            )}
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};

// Admin email constant — sourced from env var so it is not a hardcoded literal in the bundle
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'roshni.nekkanti@gmail.com';


const LoginView = ({ onLogin }: { onLogin: (u: User) => void }) => {
    const [error, setError] = useState<string | null>(null);
    const [signingIn, setSigningIn] = useState(false);

    const handleGoogleSignIn = async () => {
        setError(null);
        setSigningIn(true);
        try {
            // Use Firebase Auth's native Google sign-in — this ensures request.auth
            // is always populated in Firestore Security Rules, avoiding the client-ID
            // mismatch that occurred when bridging a GIS token via signInWithCredential.
            const provider = new GoogleAuthProvider();

            // Try popup first (better UX), fall back to redirect for environments
            // where popups are blocked (e.g. GitHub Pages COOP headers).
            let result;
            try {
                result = await signInWithPopup(auth, provider);
            } catch (popupErr: unknown) {
                const code = (popupErr as any)?.code;
                if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                    setSigningIn(false);
                    return;
                }
                if (code === 'auth/popup-blocked' || code === 'auth/unauthorized-domain') {
                    // Redirect as fallback — onAuthStateChanged will pick up the user on return
                    await signInWithRedirect(auth, provider);
                    return;
                }
                throw popupErr;
            }

            const firebaseUser = result.user;
            const userEmail = firebaseUser.email || '';
            const userName = firebaseUser.displayName || userEmail.split('@')[0];
            const userPicture = firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`;
            const isAdmin = userEmail === ADMIN_EMAIL;

            const user: User = {
                id: 'google-' + firebaseUser.uid,
                name: userName,
                email: userEmail,
                avatar: userPicture,
                isAdmin,
            };

            onLogin(user);
        } catch (e: unknown) {
            console.error('Google Sign-In error:', e);
            setError('Sign-in failed. Please try again.');
        } finally {
            setSigningIn(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute inset-0 z-0">
                <img src={DEFAULT_HERO_IMAGE} className="w-full h-full object-cover opacity-10 blur-sm" alt="" />
            </div>

            <div className="relative z-10 max-w-sm w-full bg-white/90 backdrop-blur p-8 rounded-3xl shadow-2xl border border-white/50 text-center">
                <div className="mb-8">
                    <h2 className="text-3xl font-serif font-bold text-stone-900 mb-2">Welcome</h2>
                    <p className="text-stone-500">Sign in with your Google account to continue.</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
                    </div>
                )}

                <div className="flex justify-center">
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={signingIn}
                        className="flex items-center gap-3 px-6 py-3 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        {signingIn ? 'Signing in...' : 'Sign in with Google'}
                    </button>
                </div>

                <p className="mt-8 text-xs text-stone-400">
                    By continuing, you agree to our Terms of Service and Privacy Policy.
                </p>
            </div>
        </div>
    );
};

const AboutView = ({ aboutImage, signatureImage }: { aboutImage: string, signatureImage: string }) => (
    <div className="max-w-5xl mx-auto px-6 py-16 animate-fade-in">
        <div className="flex flex-col md:flex-row gap-16 items-center mb-20">
             {/* Arch Image with B&W by default, Color on Hover */}
            <div className="w-full md:w-1/2 relative group px-8 md:px-0">
                 <div className="aspect-[3/4] relative overflow-hidden rounded-t-full border-4 border-white shadow-2xl transition-all duration-500 z-10">
                    <img 
                        src={aboutImage} 
                        alt="Roshni" 
                        className="w-full h-full object-cover transition-all duration-700 grayscale group-hover:grayscale-0 group-hover:scale-110" 
                    />
                </div>
                {/* Decorative border offset */}
                <div className="absolute -z-10 top-6 -right-4 md:-right-8 w-full h-full rounded-t-full border-2 border-stone-900 hidden md:block transition-transform duration-500 group-hover:translate-x-2 group-hover:-translate-y-2" />
            </div>

            <div className="w-full md:w-1/2 md:pl-8 text-center md:text-left">
                <div className="mb-8">
                     <span className="font-serif italic text-2xl text-rose-800 mb-3 block">The Face Behind Ro-shines</span>
                     <h1 className="text-5xl lg:text-6xl font-serif font-bold text-stone-900 mb-6 leading-tight">Roshni Nekkanti</h1>
                </div>
                <div className="space-y-6 text-lg text-stone-600 font-light leading-relaxed">
                    <p>
                        Welcome to my digital sanctuary. Ro-shines is born from a desire to slow down and document the beautiful details that often go unnoticed in our busy lives.
                    </p>
                    <p>
                        By day, I am a Developer crafting elegant AI Agents in the urban hum, but my heart yearns for the stillness of the mountains. This blog is the bridge between those two worlds. When I'm not coding, I am an artist of the intentional life: practicing mindfulness among the butterflies in my garden, exploring nature's quiet pockets, and celebrating sustainable fashion.
                    </p>
                    <p>
                        Dive into these pages for travel diaries and conscious living tips, a curated collection viewed with intentionality and balance. May these stories illuminate your path.
                    </p>
                </div>
                 <div className="mt-10">
                    <img src={signatureImage} alt="Signature" className="h-12 opacity-50 mx-auto md:mx-0" />
                </div>
            </div>
        </div>

        {/* Contact Section - Retaining the specific requested cards */}
        <div className="border-t border-stone-200 pt-16">
            <h2 className="text-3xl font-serif font-bold text-stone-900 mb-10 text-center md:text-left">Let's Connect</h2>
            <div className="grid grid-cols-1 gap-8">
                <a href="mailto:roshni.nekkanti@gmail.com" className="group relative bg-white p-10 rounded-3xl border border-stone-100 shadow-sm hover:shadow-lg hover:border-rose-100 transition-all overflow-hidden text-center md:text-left">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Icons.Send size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center text-stone-900 mb-6 group-hover:scale-110 transition-transform mx-auto md:mx-0">
                            <Icons.Send size={24} />
                        </div>
                        <h3 className="font-bold text-xl text-stone-900 mb-2">Email Me</h3>
                        <p className="text-stone-500 mb-6">For collaborations, questions, or just to say hello.</p>
                        <p className="font-serif text-lg text-stone-900 border-b-2 border-rose-100 inline-block pb-1 group-hover:border-rose-300 transition-colors break-all">roshni.nekkanti@gmail.com</p>
                    </div>
                </a>
                
                <a href="https://instagram.com/Roshni_Chowdary" target="_blank" rel="noopener noreferrer" className="group relative bg-white p-10 rounded-3xl border border-stone-100 shadow-sm hover:shadow-lg hover:border-rose-100 transition-all overflow-hidden text-center md:text-left">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Icons.Camera size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center text-stone-900 mb-6 group-hover:scale-110 transition-transform mx-auto md:mx-0">
                            <Icons.Camera size={24} />
                        </div>
                        <h3 className="font-bold text-xl text-stone-900 mb-2">Follow Along</h3>
                        <p className="text-stone-500 mb-6">Daily inspiration and behind the scenes.</p>
                         <p className="font-serif text-lg text-stone-900 border-b-2 border-rose-100 inline-block pb-1 group-hover:border-rose-300 transition-colors">@Roshni_Chowdary</p>
                    </div>
                </a>
            </div>
        </div>
    </div>
);

const AdminSettings = ({ settings, onSave, onCancel }: { settings: SiteSettings, onSave: (s: SiteSettings) => void, onCancel: () => void }) => {
    const [formData, setFormData] = useState(settings);

    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, key: 'heroImage' | 'aboutImage' | 'signatureImage') => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 300 * 1024) {
            setUploadError(`"${file.name}" is too large (max 300 KB). Please resize it first or use a URL instead.`);
            e.target.value = '';
            return;
        }
        setUploadError(null);
        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({ ...prev, [key]: reader.result as string }));
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
            <h1 className="text-3xl font-serif font-bold text-stone-900 mb-8">Site Settings</h1>
            {uploadError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {uploadError}
                    <button onClick={() => setUploadError(null)} className="ml-2 underline">Dismiss</button>
                </div>
            )}
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-stone-700 mb-2">Site Name</label>
                    <input 
                        type="text" 
                        value={formData.siteName} 
                        onChange={e => setFormData({...formData, siteName: e.target.value})}
                        className="w-full p-3 bg-white border border-stone-200 rounded-xl outline-none focus:border-stone-900" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-stone-700 mb-2">Hero Image</label>
                    <div className="flex flex-col gap-2">
                        <label className="cursor-pointer bg-white border border-stone-300 text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-50 transition-colors text-sm font-medium w-fit flex items-center gap-2">
                            <Icons.Camera size={16}/> Upload Hero Image
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'heroImage')} />
                        </label>
                        <img src={formData.heroImage} className="w-full h-32 object-cover rounded-lg opacity-80 border border-stone-200" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-stone-700 mb-2">About Page Image</label>
                     <div className="flex flex-col gap-2">
                        <label className="cursor-pointer bg-white border border-stone-300 text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-50 transition-colors text-sm font-medium w-fit flex items-center gap-2">
                            <Icons.Camera size={16}/> Upload About Image
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'aboutImage')} />
                        </label>
                        <img src={formData.aboutImage} className="w-full h-32 object-cover rounded-lg opacity-80 border border-stone-200" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-stone-700 mb-2">Signature Image</label>
                     <div className="flex flex-col gap-2">
                        <label className="cursor-pointer bg-white border border-stone-300 text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-50 transition-colors text-sm font-medium w-fit flex items-center gap-2">
                            <Icons.PenTool size={16}/> Upload Signature Image
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'signatureImage')} />
                        </label>
                        <div className="p-4 border border-stone-200 rounded-lg bg-white w-fit">
                            <img src={formData.signatureImage} className="h-12 opacity-80" alt="Signature preview" />
                        </div>
                    </div>
                </div>
                <div className="flex gap-4 pt-4">
                    <button onClick={onCancel} className="flex-1 py-3 text-stone-600 font-medium hover:bg-stone-100 rounded-xl transition-colors">Cancel</button>
                    <button onClick={() => onSave(formData)} className="flex-1 py-3 bg-stone-900 text-white font-bold rounded-xl hover:bg-stone-800 transition-colors">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const RestrictionModal = ({ isOpen, onClose, onLogin }: { isOpen: boolean, onClose: () => void, onLogin: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center relative">
                 <button onClick={onClose} className="absolute right-4 top-4 text-stone-400 hover:text-stone-600"><Icons.X size={20}/></button>
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <Icons.Heart size={32} />
                </div>
                <h3 className="text-2xl font-serif font-bold text-stone-900 mb-3">Show Your Love</h3>
                <p className="text-stone-500 mb-8">
                    You have to login to shower your love.
                </p>
                <button onClick={onLogin} className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-colors shadow-lg">
                    Login
                </button>
            </div>
        </div>
    );
};

// ... LikeButton, CommentSection, PostDetailView, HomeView, DeleteConfirmationModal, AdminDashboard, Editor components remain same ...
const LikeButton = ({ postId, initialCount, initialLiked, userId, onRestricted }: { postId: string, initialCount: number, initialLiked: boolean, userId?: string, onRestricted: () => void }) => {
    const [liked, setLiked] = useState(initialLiked);
    const [count, setCount] = useState(initialCount);
    const [animate, setAnimate] = useState(false);

    // Sync state when props change (e.g., after fetching real data from Firestore)
    useEffect(() => {
        setLiked(initialLiked);
        setCount(initialCount);
    }, [initialLiked, initialCount]);

    const handleToggle = async () => {
        if (!userId) { onRestricted(); return; }
        const newLiked = !liked;
        setLiked(newLiked);
        setCount(c => newLiked ? c + 1 : Math.max(0, c - 1)); // Never go below 0
        if (newLiked) setAnimate(true);
        try {
            const result = await db.toggleLike(postId, userId);
            // Update with actual count from server
            setCount(result.count);
            setLiked(result.liked);
        } catch (e) {
            // Revert on error
            setLiked(!newLiked);
            setCount(c => !newLiked ? c + 1 : Math.max(0, c - 1));
        }
    };
    useEffect(() => { if(animate) { const t = setTimeout(() => setAnimate(false), 500); return () => clearTimeout(t); } }, [animate]);

    return (
        <button 
            onClick={handleToggle}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${liked ? 'bg-rose-50 text-rose-600' : 'bg-stone-50 text-stone-500 hover:bg-stone-100'}`}
        >
            <Icons.Sparkles size={18} className={`transition-transform duration-300 ${animate ? 'scale-150 rotate-12' : ''} ${liked ? 'fill-rose-600' : ''}`}/>
            <span className="font-bold text-sm">{count}</span>
        </button>
    );
};

const CommentSection = ({ postId, currentUser, onRestricted }: { postId: string, currentUser: User | null, onRestricted: () => void }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
    const [emojiPickerOpen, setEmojiPickerOpen] = useState<{ [commentId: string]: boolean }>({});
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
    const [commentError, setCommentError] = useState<string | null>(null);

    const setLoading = (id: string, on: boolean) => {
        setLoadingIds(prev => {
            const next = new Set(prev);
            if (on) next.add(id); else next.delete(id);
            return next;
        });
    };
    const isLoading = (id: string) => loadingIds.has(id);

    const loadComments = async () => {
        try {
            const loadedComments = await db.getComments(postId, currentUser?.id);
            setComments(loadedComments);
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    };

    useEffect(() => { 
        loadComments();
    }, [postId, currentUser?.id]);

    // Close emoji picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.emoji-picker-container') && !target.closest('.emoji-picker-trigger')) {
                setEmojiPickerOpen({});
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) { onRestricted(); return; }
        if (!newComment.trim()) return;
        setCommentError(null);
        setLoading('new-comment', true);
        try {
            await db.addComment(postId, currentUser, newComment);
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedComments = await db.getComments(postId, currentUser.id);
            setComments(updatedComments);
            setNewComment('');
        } catch (error) {
            console.error('Error adding comment:', error);
            setCommentError('Failed to post comment. Please try again.');
        } finally { setLoading('new-comment', false); }
    };

    const handleReply = async (parentId: string, replyContent: string) => {
        if (!currentUser) { onRestricted(); return; }
        if (!replyContent.trim()) return;
        setCommentError(null);
        setLoading(parentId, true);
        try {
            await db.addComment(postId, currentUser, replyContent, parentId);
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedComments = await db.getComments(postId, currentUser.id);
            setComments(updatedComments);
            setReplyText({ ...replyText, [parentId]: '' });
            setReplyingTo(null);
        } catch (error) {
            console.error('Error adding reply:', error);
            setCommentError('Failed to post reply. Please try again.');
        } finally { setLoading(parentId, false); }
    };

    const handleReaction = async (commentId: string, reactionType: string) => {
        if (!currentUser) { 
            onRestricted(); 
            return; 
        }
        
        // Optimistically update UI
        setComments(prevComments => {
            return prevComments.map(comment => {
                const updateCommentReactions = (c: Comment): Comment => {
                    const reactions = { ...(c.reactions || {}) };
                    const userReactions = [...(c.userReactions || [])];
                    const currentCount = reactions[reactionType] || 0;
                    const hasReacted = userReactions.includes(reactionType);
                    
                    if (hasReacted) {
                        reactions[reactionType] = Math.max(0, currentCount - 1);
                        return {
                            ...c,
                            reactions,
                            userReactions: userReactions.filter(r => r !== reactionType)
                        };
                    } else {
                        reactions[reactionType] = currentCount + 1;
                        return {
                            ...c,
                            reactions,
                            userReactions: [...userReactions, reactionType]
                        };
                    }
                };
                
                if (comment.id === commentId) {
                    return updateCommentReactions(comment);
                }
                
                // Check replies
                if (comment.replies && comment.replies.length > 0) {
                    return {
                        ...comment,
                        replies: comment.replies.map(reply => 
                            reply.id === commentId ? updateCommentReactions(reply) : reply
                        )
                    };
                }
                
                return comment;
            });
        });
        
        try {
            await db.toggleReaction(postId, commentId, currentUser.id, reactionType);
            const updatedComments = await db.getComments(postId, currentUser.id);
            setComments(updatedComments);
        } catch (error) {
            console.error('Error toggling reaction:', error);
            setCommentError(`Failed to save reaction. Please try again.`);
            // Reload on error to revert optimistic update
            try {
                const updatedComments = await db.getComments(postId, currentUser.id);
                setComments(updatedComments);
            } catch (reloadError) {
                console.error('Error reloading comments after reaction error:', reloadError);
            }
        }
    };

    // Common emoji reactions
    const EMOJI_OPTIONS = [
        { emoji: '😂', name: 'joy' },
        { emoji: '😍', name: 'heart_eyes' },
        { emoji: '😮', name: 'open_mouth' },
        { emoji: '👍', name: 'thumbsup' },
        { emoji: '👎', name: 'thumbsdown' },
        { emoji: '👏', name: 'clap' },
        { emoji: '🔥', name: 'fire' },
        { emoji: '❤️', name: 'red_heart' },
        { emoji: '✨', name: 'sparkles' },
        { emoji: '🎉', name: 'party' },
        { emoji: '💯', name: 'hundred' }
    ];

    const renderComment = (comment: Comment, isReply = false) => {
        const reactions = comment.reactions || {};
        const userReactions = comment.userReactions || [];
        const isReplying = replyingTo === comment.id;
        const isEmojiPickerOpen = emojiPickerOpen[comment.id] || false;

        // Get all reaction emojis that have counts > 0, sorted by count descending
        const activeReactions = Object.entries(reactions)
            .filter(([_, count]) => typeof count === 'number' && count > 0)
            .map(([emoji, count]) => ({ emoji, count: count as number }))
            .sort((a, b) => b.count - a.count);

        return (
            <div key={comment.id} className={`${isReply ? 'ml-12 mt-4 border-l-2 border-stone-100 pl-4' : ''} animate-fade-in`}>
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 font-bold overflow-hidden flex-shrink-0 relative">
                        {comment.userAvatar && !imageErrors.has(comment.id) ? (
                            <img 
                                src={comment.userAvatar} 
                                alt={comment.userName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={() => {
                                    // Mark this image as failed and trigger re-render
                                    setImageErrors(prev => new Set(prev).add(comment.id));
                                }}
                            />
                        ) : (
                            <span className="w-full h-full flex items-center justify-center">{comment.userName.charAt(0)}</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-stone-900 text-sm">{comment.userName}</span>
                            <span className="text-xs text-stone-400">• {new Date(comment.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-stone-600 text-sm leading-relaxed mb-3">{comment.content}</p>
                        
                        {/* Reactions */}
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                            {/* Heart Button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleReaction(comment.id, '❤️');
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                                    userReactions.includes('❤️') 
                                        ? 'bg-rose-100 text-rose-600' 
                                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                                }`}
                            >
                                <span className="text-sm">❤️</span>
                                <span className="font-medium">{reactions['❤️'] || 0}</span>
                            </button>

                            {/* Reaction Button with Emoji Picker */}
                            <div className="relative emoji-picker-container">
                                <button
                                    type="button"
                                    className="emoji-picker-trigger flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEmojiPickerOpen({ ...emojiPickerOpen, [comment.id]: !isEmojiPickerOpen });
                                    }}
                                >
                                    <span className="text-sm">😊</span>
                                    <span className="text-xs">React</span>
                                </button>
                                
                                {/* Emoji Picker */}
                                {isEmojiPickerOpen && (
                                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-stone-200 rounded-xl shadow-xl p-3 z-50 animate-fade-in emoji-picker-container min-w-[200px]">
                                        <div className="grid grid-cols-4 gap-2">
                                            {EMOJI_OPTIONS.map(({ emoji, name }) => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleReaction(comment.id, emoji);
                                                        setEmojiPickerOpen({ ...emojiPickerOpen, [comment.id]: false });
                                                    }}
                                                    className={`w-10 h-10 flex items-center justify-center rounded-lg text-xl hover:bg-stone-100 transition-colors ${
                                                        userReactions.includes(emoji) ? 'bg-blue-50 ring-2 ring-blue-200' : ''
                                                    }`}
                                                    title={name}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Display Active Reactions */}
                            {activeReactions.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {activeReactions.map(({ emoji, count }) => {
                                        const numCount = typeof count === 'number' ? count : 0;
                                        return (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleReaction(comment.id, emoji);
                                                }}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
                                                    userReactions.includes(emoji)
                                                        ? 'bg-blue-100 text-blue-600 border border-blue-200'
                                                        : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200'
                                                }`}
                                            >
                                                <span className="text-sm">{emoji}</span>
                                                <span className="font-semibold text-xs">{numCount}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {!isReply && (
                                <button
                                    type="button"
                                    onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                                    className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 transition-colors"
                                >
                                    <Icons.MessageCircle size={14} />
                                    Reply
                                </button>
                            )}
                        </div>

                        {/* Reply Form */}
                        {isReplying && (
                            <div className="mb-4">
                                <textarea
                                    value={replyText[comment.id] || ''}
                                    onChange={(e) => setReplyText({ ...replyText, [comment.id]: e.target.value })}
                                    placeholder="Write a reply..."
                                    className="w-full bg-stone-50 rounded-xl p-3 text-sm outline-none border border-stone-200 focus:border-stone-400 focus:bg-white transition-all resize-none"
                                    rows={2}
                                />
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={() => handleReply(comment.id, replyText[comment.id] || '')}
                                        disabled={!replyText[comment.id]?.trim() || isLoading(comment.id)}
                                        className="bg-stone-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors"
                                    >
                                        {isLoading(comment.id) ? 'Posting...' : 'Post Reply'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setReplyingTo(null);
                                            setReplyText({ ...replyText, [comment.id]: '' });
                                        }}
                                        className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-900"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Nested Replies */}
                        {comment.replies && comment.replies.length > 0 && (
                            <div className="mt-4">
                                {comment.replies.map(reply => renderComment(reply, true))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const totalComments = comments.reduce((acc, comment) => acc + 1 + (comment.replies?.length || 0), 0);

    return (
        <div className="mt-16 border-t border-stone-100 pt-12">
            <h3 className="text-2xl font-serif font-bold text-stone-900 mb-8">Discussion ({totalComments})</h3>
            <form onSubmit={handleSubmit} className="mb-12 relative">
                <textarea 
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder={currentUser ? "Share your thoughts..." : "Please login to comment..."}
                    className="w-full bg-stone-50 rounded-xl p-4 min-h-[120px] outline-none border border-transparent focus:border-stone-200 focus:bg-white transition-all resize-none"
                    disabled={isLoading('new-comment')}
                />
                <div className="absolute bottom-4 right-4">
                        <button 
                            type="submit" 
                            onClick={!currentUser ? (e) => { e.preventDefault(); onRestricted(); } : undefined} 
                            disabled={(!newComment.trim() && !!currentUser) || isLoading('new-comment')} 
                            className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors"
                        >
                            {isLoading('new-comment') ? 'Posting...' : 'Post Comment'}
                        </button>
                </div>
            </form>
            {commentError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {commentError}
                    <button onClick={() => setCommentError(null)} className="ml-2 underline">Dismiss</button>
                </div>
            )}
            <div className="space-y-8">
                {comments.map(comment => renderComment(comment))}
            </div>
        </div>
    );
};

const PostDetailView = ({ post, onBack, currentUser, onRestricted, onEdit }: { post: BlogPost, onBack: () => void, currentUser: User | null, onRestricted: () => void, onEdit?: () => void }) => {
    const [likeStatus, setLikeStatus] = useState({ liked: false, count: post.likesCount || 0 });

    useEffect(() => {
        db.getLikeStatus(post.id, currentUser?.id).then(status => {
            setLikeStatus({ liked: status.liked, count: Math.max(status.count, post.likesCount || 0) });
        });
        window.scrollTo(0, 0);
    }, [post.id, currentUser]);

    return (
        <article className="min-h-screen bg-white animate-fade-in">
            <div className="h-[50vh] md:h-[60vh] relative overflow-hidden">
                <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute top-6 left-6 z-20 flex gap-2">
                    <button onClick={onBack} className="bg-white/20 backdrop-blur-md text-white p-3 rounded-full hover:bg-white/30 transition-colors">
                        <Icons.ChevronLeft size={24} />
                    </button>
                    {currentUser?.isAdmin && onEdit && (
                        <button onClick={onEdit} className="bg-white/20 backdrop-blur-md text-white p-3 rounded-full hover:bg-white/30 transition-colors flex items-center gap-2">
                            <Icons.PenTool size={20} />
                            <span className="text-sm font-medium hidden md:inline">Edit</span>
                        </button>
                    )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 text-white max-w-4xl mx-auto">
                    <span className="inline-block px-3 py-1 rounded-md bg-white/20 backdrop-blur text-xs font-bold uppercase tracking-widest mb-4">{post.category}</span>
                    <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6 leading-tight">{post.title}</h1>
                    <div className="flex items-center gap-6 text-sm font-medium text-white/80">
                         <span>{post.author}</span>
                         <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                         <span>{post.views} reads</span>
                    </div>
                </div>
            </div>
            <div className="max-w-3xl mx-auto px-6 py-12">
                <p className="text-xl md:text-2xl text-stone-600 font-serif leading-relaxed mb-12 italic border-l-4 border-stone-200 pl-6">{post.excerpt}</p>
                <div className="max-w-none">
                    <BlockEditor blocks={post.blocks} onChange={() => {}} readOnly={true} />
                </div>
                <div className="mt-16 pt-8 border-t border-stone-100 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex flex-wrap gap-2">
                        {post.tags.map(tag => <span key={tag} className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-1 rounded-full uppercase tracking-wider">#{tag}</span>)}
                    </div>
                    <LikeButton postId={post.id} initialCount={likeStatus.count} initialLiked={likeStatus.liked} userId={currentUser?.id} onRestricted={onRestricted} />
                </div>
                <CommentSection postId={post.id} currentUser={currentUser} onRestricted={onRestricted} />
            </div>
        </article>
    );
};

const HomeView: React.FC<{ 
    posts: BlogPost[]; 
    onPostClick: (id: string) => void; 
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    heroImage: string;
}> = ({ posts, onPostClick, searchQuery, setSearchQuery, heroImage }) => {
    const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
    
    const filteredPosts = useMemo(() => {
        const now = new Date();
        let filtered = posts.filter(p => 
            p.status === 'published' && 
            (!p.scheduledAt || new Date(p.scheduledAt) <= now)
        );
        if (selectedCategory !== 'All') filtered = filtered.filter(p => p.category === selectedCategory);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => 
                p.title.toLowerCase().includes(q) || 
                p.excerpt.toLowerCase().includes(q) ||
                p.tags.some(t => t.toLowerCase().includes(q))
            );
        }
        return filtered;
    }, [posts, selectedCategory, searchQuery]);

    return (
        <main className="min-h-screen">
            {!searchQuery && (
                <section className="relative h-[60vh] flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-stone-200">
                        <img src={heroImage} className="w-full h-full object-cover opacity-50 transition-opacity duration-1000" alt="Hero" />
                    </div>
                    <div className="relative z-10 text-center px-4 animate-slide-up">
                        <span className="inline-block py-1 px-3 rounded-full bg-white/20 backdrop-blur-sm text-stone-900 text-xs font-semibold uppercase tracking-widest mb-4 border border-white/30">Welcome to Ro-shines</span>
                        <h1 className="text-5xl md:text-7xl font-serif font-bold text-stone-900 mb-6 drop-shadow-sm">Stories by Roshni</h1>
                        <p className="text-lg md:text-xl text-stone-700 max-w-2xl mx-auto font-light">Exploring the intersection of design, culture, and conscious living.</p>
                        <p className="text-xs md:text-sm max-w-xs font-serif italic mt-3 text-rose-500 text-center mx-auto">
                            <span className="bg-rose-200/60 px-3 py-1 rounded-md leading-relaxed select-none">
                                roses are red, violets are blue, i patched the garden, no entry for you 🌹<br />the garden is tended, the gate is locked, bloom season is over for uninvited guests 🌸
                            </span>
                        </p>
                    </div>
                </section>
            )}
            <div className="max-w-7xl mx-auto px-6 py-16">
                {searchQuery && (
                     <div className="mb-8 pb-4 border-b border-stone-200">
                        <h2 className="text-2xl font-serif text-stone-800">Search results for "<span className="italic">{searchQuery}</span>"</h2>
                     </div>
                )}
                {!searchQuery && (
                    <div className="flex flex-wrap gap-4 justify-center mb-16">
                        <button onClick={() => setSelectedCategory('All')} className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${selectedCategory === 'All' ? 'bg-stone-800 text-white shadow-lg' : 'bg-white text-stone-500 hover:bg-stone-100'}`}>All Stories</button>
                        {Object.values(Category).map(cat => {
                            const Icon = CATEGORY_CONFIG[cat].icon;
                            return (
                                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${selectedCategory === cat ? 'bg-stone-800 text-white shadow-lg' : 'bg-white text-stone-500 hover:bg-stone-100'}`}>
                                    <Icon size={14} /> {cat}
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
                    {filteredPosts.map((post) => (
                        <article key={post.id} onClick={() => onPostClick(post.id)} className="group cursor-pointer flex flex-col gap-4 animate-fade-in">
                            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-stone-100">
                                <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md shadow-sm">{post.category}</div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-serif font-bold text-stone-900 group-hover:text-rose-900 transition-colors mb-2 leading-tight">{post.title}</h2>
                                <p className="text-stone-500 line-clamp-2 text-sm leading-relaxed mb-3">{post.excerpt}</p>
                                <div className="flex items-center gap-2 text-xs text-stone-400 font-medium">
                                    <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>{post.views} views</span>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
                {filteredPosts.length === 0 && (
                    <div className="text-center py-20 text-stone-400">
                        <Icons.Coffee size={48} className="mx-auto mb-4 opacity-50"/>
                        <p>No stories found.</p>
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="mt-4 text-stone-800 underline">Clear Search</button>}
                    </div>
                )}
            </div>
        </main>
    );
}

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <Icons.Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold text-center text-stone-900 mb-2">Delete Story?</h3>
                <p className="text-center text-stone-500 text-sm mb-6">
                    Are you sure you want to delete this story? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-medium hover:bg-stone-50">Cancel</button>
                    <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Delete</button>
                </div>
            </div>
        </div>
    );
};

interface AdminDashboardProps {
  posts: BlogPost[];
  onEdit: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onOpenSettings: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ posts, onEdit, onNew, onDelete, onToggleStatus, onOpenSettings }) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stories' | 'subscribers' | 'analytics'>('stories');
  const [subscribers, setSubscribers] = useState<string[]>([]);
  const [pageViews, setPageViews] = useState<{ path: string; count: number }[]>([]);
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
      if (activeTab === 'subscribers') {
          db.getSubscribers().then(setSubscribers);
      }
      if (activeTab === 'analytics') {
          db.getPageViews().then(setPageViews);
          db.getTotalVisitors().then(setTotalVisitors);
      }
  }, [activeTab]);

  const handleCopyBCC = () => {
      const bcc = subscribers.join(', ');
      navigator.clipboard.writeText(bcc).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2500);
      }).catch(() => {
          setCopySuccess(false);
          alert('Could not access clipboard. Please copy the emails manually.');
      });
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
      <DeleteConfirmationModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={() => { if(deleteId) onDelete(deleteId); setDeleteId(null); }} 
      />

      <div className="flex justify-between items-center mb-10">
        <div>
           <h1 className="text-3xl font-serif font-bold text-stone-900 mb-1">Dashboard</h1>
           <p className="text-stone-500">Manage your stories and site settings.</p>
        </div>
        <div className="flex gap-3">
             <button onClick={onOpenSettings} className="bg-white border border-stone-200 text-stone-700 px-4 py-2.5 rounded-xl font-bold hover:bg-stone-50 transition-colors flex items-center gap-2">
                <Icons.Type size={18}/> Site Settings
            </button>
            <button onClick={onNew} className="bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-stone-800 transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                <Icons.Plus size={18}/> New Story
            </button>
        </div>
      </div>

      <div className="flex gap-6 mb-8 border-b border-stone-100">
          <button 
            onClick={() => setActiveTab('stories')}
            className={`pb-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'stories' ? 'text-stone-900 border-stone-900' : 'text-stone-400 border-transparent hover:text-stone-600'}`}
          >
              Stories
          </button>
          <button 
            onClick={() => setActiveTab('subscribers')}
            className={`pb-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'subscribers' ? 'text-stone-900 border-stone-900' : 'text-stone-400 border-transparent hover:text-stone-600'}`}
          >
              Subscribers
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`pb-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'analytics' ? 'text-stone-900 border-stone-900' : 'text-stone-400 border-transparent hover:text-stone-600'}`}
          >
              Analytics
          </button>
      </div>

      {activeTab === 'stories' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
            <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-100">
                <tr>
                <th className="text-left py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Title</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Views</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Date</th>
                <th className="text-right py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
                {posts.map((post) => (
                <tr key={post.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-4 px-6">
                    <div className="font-bold text-stone-900">{post.title}</div>
                    <div className="text-xs text-stone-400 mt-1">{post.category}</div>
                    </td>
                    <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${post.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        <span className="text-sm font-medium text-stone-600 capitalize">{post.status}</span>
                        <button 
                            onClick={() => onToggleStatus(post.id)}
                            className={`ml-2 text-xs font-bold px-2 py-1 rounded border transition-colors ${post.status === 'published' ? 'border-stone-200 text-stone-500 hover:bg-stone-100' : 'bg-stone-900 text-white border-transparent hover:bg-stone-800'}`}
                        >
                            {post.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                    </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-stone-600">{post.views}</td>
                    <td className="py-4 px-6 text-sm text-stone-600">{new Date(post.publishedAt).toLocaleDateString()}</td>
                    <td className="py-4 px-6 text-right space-x-2">
                    <button onClick={() => onEdit(post.id)} className="text-stone-400 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg">
                        <Icons.PenTool size={18} />
                    </button>
                    <button onClick={() => setDeleteId(post.id)} className="text-stone-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg">
                        <Icons.Trash2 size={18} />
                    </button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
            {posts.length === 0 && (
                <div className="p-12 text-center text-stone-400">
                    <p>No stories yet. Start writing your first one!</p>
                </div>
            )}
        </div>
      ) : activeTab === 'analytics' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden p-8">
              <div className="mb-8">
                  <h2 className="text-xl font-bold text-stone-900 mb-1">Visitor Analytics</h2>
                  <p className="text-stone-500 text-sm">Page view counts tracked per session (one record per visitor per page per session).</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <div className="p-5 bg-stone-50 rounded-xl border border-stone-100">
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Total Page Views</p>
                      <p className="text-3xl font-bold text-stone-900">{totalVisitors}</p>
                  </div>
                  <div className="p-5 bg-stone-50 rounded-xl border border-stone-100">
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Tracked Pages</p>
                      <p className="text-3xl font-bold text-stone-900">{pageViews.length}</p>
                  </div>
              </div>
              <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-4">Top Pages</h3>
              <div className="space-y-3">
                  {pageViews.length === 0 && <p className="text-stone-400 text-sm">No data yet. Views will appear as visitors browse.</p>}
                  {pageViews.map(({ path, count }) => (
                      <div key={path} className="flex items-center gap-3">
                          <span className="text-sm text-stone-600 font-medium flex-1 truncate">{path}</span>
                          <div className="flex items-center gap-2">
                              <div className="h-2 rounded-full bg-stone-200 w-24 overflow-hidden">
                                  <div
                                      className="h-2 rounded-full bg-stone-800"
                                      style={{ width: `${Math.min(100, (count / (pageViews[0]?.count || 1)) * 100)}%` }}
                                  />
                              </div>
                              <span className="text-sm font-bold text-stone-800 w-8 text-right">{count}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden p-8">
              <div className="flex justify-between items-center mb-8">
                  <div>
                      <h2 className="text-xl font-bold text-stone-900">Subscriber List ({subscribers.length})</h2>
                      <p className="text-stone-500 text-sm mt-1">People who have joined your newsletter.</p>
                  </div>
                  <button onClick={handleCopyBCC} disabled={subscribers.length === 0} className="bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-stone-800 transition-colors flex items-center gap-2 disabled:opacity-50">
                    <Icons.Send size={16} /> {copySuccess ? 'Copied!' : 'Copy BCC List'}
                  </button>
              </div>
              {copySuccess && (
                  <p className="text-xs text-emerald-600 mb-4">All subscriber emails copied to clipboard. Paste into your email client's BCC field.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {subscribers.map((email, i) => (
                      <div key={i} className="p-4 border border-stone-100 rounded-xl bg-stone-50 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 font-bold text-xs">
                              {email.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-stone-600 font-medium text-sm">{email}</span>
                      </div>
                  ))}
                  {subscribers.length === 0 && <div className="col-span-3 text-center text-stone-400 py-10">No subscribers yet.</div>}
              </div>
          </div>
      )}
    </div>
  );
};

const Editor: React.FC<{ 
    post: BlogPost; 
    onSave: (post: BlogPost) => void; 
    onCancel: () => void;
}> = ({ post, onSave, onCancel }) => {
  const [editedPost, setEditedPost] = useState(post);
  const [showSettings, setShowSettings] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleBlockChange = (blocks: ContentBlock[]) => {
    setEditedPost(prev => ({ ...prev, blocks }));
  };
  
  const handleTitleSuggest = async () => {
    if(!editedPost.blocks.length) return;
    const summary = editedPost.blocks.slice(0, 3).map(b => b.content).join(' ');
    const title = await suggestTitle(summary);
    if(title) setEditedPost({ ...editedPost, title });
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if(e.key === 'Enter' && tagInput.trim()) {
        e.preventDefault();
        if(!editedPost.tags.includes(tagInput.trim())) {
            setEditedPost({ ...editedPost, tags: [...editedPost.tags, tagInput.trim()] });
        }
        setTagInput('');
    }
  }

  const removeTag = (tag: string) => {
      setEditedPost({ ...editedPost, tags: editedPost.tags.filter(t => t !== tag) });
  }

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          // Check file size - warn if too large (> 500KB before compression)
          if (file.size > 5 * 1024 * 1024) {
              alert('Image is too large. Please use an image under 5MB or provide a URL instead.');
              return;
          }
          
          // Compress image using canvas to reduce size for Firestore
          const img = new Image();
          const reader = new FileReader();
          
          reader.onload = (event) => {
              img.onload = () => {
                  // Create canvas for compression
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  
                  // Calculate new dimensions (max 1200px width/height)
                  const maxSize = 1200;
                  let { width, height } = img;
                  
                  if (width > height && width > maxSize) {
                      height = (height * maxSize) / width;
                      width = maxSize;
                  } else if (height > maxSize) {
                      width = (width * maxSize) / height;
                      height = maxSize;
                  }
                  
                  canvas.width = width;
                  canvas.height = height;
                  
                  // Draw and compress
                  ctx?.drawImage(img, 0, 0, width, height);
                  
                  // Convert to JPEG with 70% quality for smaller size
                  const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                  
                  // Check if compressed size is acceptable (< 800KB for Firestore safety)
                  const base64Size = (compressedBase64.length * 3) / 4; // Approximate byte size
                  if (base64Size > 800 * 1024) {
                      alert('Image is still too large after compression. Please use a smaller image or provide a URL instead.');
                      return;
                  }
                  
                  setEditedPost(prev => ({ ...prev, coverImage: compressedBase64 }));
              };
              img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
      }
  };

  if (isPreview) {
      return (
          <div className="fixed inset-0 bg-stone-50 z-50 overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex justify-between items-center z-40">
                  <h2 className="font-bold text-stone-500">Preview Mode</h2>
                  <button onClick={() => setIsPreview(false)} className="bg-stone-900 text-white px-4 py-2 rounded-lg font-bold text-sm">Close Preview</button>
              </div>
              <PostDetailView post={editedPost} onBack={() => setIsPreview(false)} currentUser={null} onRestricted={() => {}} />
          </div>
      )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar - Settings */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-white border-l border-stone-200 transform transition-transform duration-300 z-30 shadow-2xl p-6 overflow-y-auto ${showSettings ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}>
          <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif font-bold text-xl">Post Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-stone-400 hover:text-stone-600"><Icons.X size={20}/></button>
          </div>
          
          <div className="space-y-6">
               <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase mb-2">Publish Date</label>
                  <div className="relative">
                       <Icons.Calendar className="absolute left-3 top-3 text-stone-400" size={16} />
                       <input 
                          type="datetime-local"
                          value={editedPost.scheduledAt || ''}
                          onChange={(e) => setEditedPost({...editedPost, scheduledAt: e.target.value})}
                          className="w-full pl-10 pr-3 py-2 bg-stone-50 rounded-lg text-sm border border-stone-200 outline-none focus:border-stone-800"
                       />
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Leave empty to publish immediately.</p>
               </div>

               <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase mb-2">Category</label>
                  <div className="grid grid-cols-2 gap-2">
                      {Object.keys(Category).map(cat => (
                          <button 
                            key={cat}
                            onClick={() => setEditedPost({...editedPost, category: cat as Category})}
                            className={`text-xs font-bold py-2 px-3 rounded-lg border transition-colors ${editedPost.category === cat ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'}`}
                          >
                              {cat}
                          </button>
                      ))}
                  </div>
               </div>

               <div>
                   <label className="block text-xs font-bold text-stone-500 uppercase mb-2">Tags</label>
                   <div className="flex flex-wrap gap-2 mb-2">
                       {editedPost.tags.map(tag => (
                           <span key={tag} className="inline-flex items-center gap-1 bg-stone-100 px-2 py-1 rounded text-xs font-bold text-stone-600">
                               #{tag} <button onClick={() => removeTag(tag)}><Icons.X size={10} /></button>
                           </span>
                       ))}
                   </div>
                   <div className="relative">
                       <Icons.Hash className="absolute left-3 top-2.5 text-stone-400" size={14} />
                       <input 
                          type="text" 
                          placeholder="Add tag + Enter"
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={handleAddTag}
                          className="w-full pl-8 pr-3 py-2 bg-stone-50 rounded-lg text-sm border border-stone-200 outline-none focus:border-stone-800"
                       />
                   </div>
               </div>

               <div>
                   <label className="block text-xs font-bold text-stone-500 uppercase mb-2">Cover Image</label>
                   <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <label className="cursor-pointer bg-white border border-stone-300 text-stone-600 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors text-xs font-medium flex items-center gap-1">
                                <Icons.Camera size={14}/> Upload
                                <input type="file" accept="image/*" className="hidden" onChange={handleCoverImageUpload} />
                            </label>
                            <span className="text-xs text-stone-400 self-center">or</span>
                        </div>
                        <input 
                            type="url"
                            placeholder="Paste image URL..."
                            value={editedPost.coverImage?.startsWith('data:') ? '' : editedPost.coverImage || ''}
                            onChange={(e) => setEditedPost({...editedPost, coverImage: e.target.value})}
                            className="w-full px-3 py-2 bg-stone-50 rounded-lg text-xs border border-stone-200 outline-none focus:border-stone-800"
                        />
                        <p className="text-[10px] text-stone-400">Tip: Use image URLs from Unsplash, Imgur, or any public link</p>
                        {editedPost.coverImage && (
                            <img src={editedPost.coverImage} className="w-full h-32 object-cover rounded-lg bg-stone-100 border border-stone-200" />
                        )}
                   </div>
               </div>
          </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300" style={{ marginRight: showSettings ? '320px' : '0' }}>
        <header className="relative bg-white border-b border-stone-100 px-6 py-4 flex items-center justify-between z-40">
            <div className="flex items-center gap-4">
                <button onClick={onCancel} className="p-2 hover:bg-stone-100 rounded-full text-stone-500 transition-colors">
                    <Icons.ChevronLeft size={20} />
                </button>
                <div className="text-sm font-medium text-stone-400">
                    {editedPost.status === 'draft' ? 'Draft' : 'Published'} 
                    {editedPost.scheduledAt && ` • Scheduled: ${new Date(editedPost.scheduledAt).toLocaleDateString()}`}
                </div>
            </div>
            <div className="flex items-center gap-3">
                 <button onClick={() => setIsPreview(true)} className="p-2 text-stone-400 hover:text-stone-900 font-bold text-sm flex items-center gap-1">
                     <Icons.Eye size={16}/> <span className="hidden md:inline">Preview</span>
                 </button>
                 <button onClick={() => setShowSettings(!showSettings)} className={`p-2 font-bold text-sm flex items-center gap-1 transition-colors ${showSettings ? 'text-stone-900 bg-stone-100 rounded-lg' : 'text-stone-400 hover:text-stone-900'}`}>
                     <Icons.Layout size={16}/> <span className="hidden md:inline">Settings</span>
                 </button>
                 <div className="h-6 w-px bg-stone-200 mx-2"></div>
                 <button type="button" onClick={() => onSave({...editedPost, status: 'draft'})} className="px-4 py-2 text-stone-600 font-bold text-sm hover:bg-stone-50 rounded-lg transition-colors">
                     Save Draft
                 </button>
                 <button type="button" onClick={() => onSave({...editedPost, status: 'published'})} className="px-5 py-2 bg-stone-900 text-white font-bold text-sm rounded-lg hover:bg-stone-800 transition-colors shadow-lg hover:shadow-xl">
                     Publish
                 </button>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-white scroll-smooth">
             <div className="max-w-3xl mx-auto px-6 py-12">
                 {/* Title & Meta Inputs */}
                 <div className="mb-8 group relative">
                    <textarea 
                        value={editedPost.title}
                        onChange={(e) => setEditedPost({...editedPost, title: e.target.value})}
                        placeholder="Story Title"
                        className="w-full text-4xl md:text-5xl font-serif font-bold text-stone-900 placeholder:text-stone-300 outline-none resize-none bg-transparent overflow-hidden"
                        rows={1}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = target.scrollHeight + 'px';
                        }}
                    />
                    <button 
                        onClick={handleTitleSuggest}
                        className="absolute right-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-full flex items-center gap-1 hover:bg-purple-100"
                    >
                        <Icons.Sparkles size={12}/> Suggest Title
                    </button>
                 </div>
                 
                 <div className="mb-12">
                     <textarea 
                        value={editedPost.excerpt}
                        onChange={(e) => setEditedPost({...editedPost, excerpt: e.target.value})}
                        placeholder="Write a short excerpt..."
                        className="w-full text-xl text-stone-500 font-serif italic outline-none resize-none bg-transparent"
                        rows={2}
                     />
                 </div>

                 {/* Block Editor */}
                 <BlockEditor blocks={editedPost.blocks} onChange={handleBlockChange} />
             </div>
        </div>
      </div>
    </div>
  );
};

// --- App Component ---

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>({ type: 'home' });
  const [previousView, setPreviousView] = useState<ViewState | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [restrictionOpen, setRestrictionOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const dismissNotification = useCallback(() => setNotification(null), []);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({
      siteName: 'Ro-shines',
      heroImage: DEFAULT_HERO_IMAGE,
      aboutImage: DEFAULT_ABOUT_IMAGE,
      signatureImage: DEFAULT_SIGNATURE_IMAGE
  });
  
  // Track Views - Ref to prevent double counting in strict mode
  const lastViewedIdRef = useRef<string | null>(null);
  /** Stable id for a new draft so parent re-renders don't rotate crypto.randomUUID() */
  const newDraftPostIdRef = useRef<string | null>(null);
  /** Prevents overlapping saves from double-clicks or slow networks */
  const postSaveInFlightRef = useRef(false);

  // Load initial data and User Session
  useEffect(() => {
      const loadData = async () => {
          // Try to load posts from Firestore first
          try {
              const firestorePosts = await db.getPosts();
              if (firestorePosts && firestorePosts.length > 0) {
                  setPosts(firestorePosts);
                  localStorage.setItem('roshines_posts', JSON.stringify(firestorePosts));
              } else {
                  // Fall back to localStorage or mock posts
                  const storedPosts = localStorage.getItem('roshines_posts');
                  if (storedPosts) {
                      setPosts(JSON.parse(storedPosts));
                  } else {
                      setPosts(MOCK_POSTS);
                      localStorage.setItem('roshines_posts', JSON.stringify(MOCK_POSTS));
                      // Save mock posts to Firestore for future use
                      await db.savePosts(MOCK_POSTS);
                  }
              }
          } catch (error) {
              console.error('Error loading posts from Firestore:', error);
              // Fall back to localStorage or mock posts
              const storedPosts = localStorage.getItem('roshines_posts');
              if (storedPosts) {
                  setPosts(JSON.parse(storedPosts));
              } else {
                  setPosts(MOCK_POSTS);
                  localStorage.setItem('roshines_posts', JSON.stringify(MOCK_POSTS));
              }
          }
      };
      
      loadData();

      const storedSettings = localStorage.getItem('roshines_settings');
      if(storedSettings) setSiteSettings(JSON.parse(storedSettings));

      // Restore User Session — recompute isAdmin from email, never trust stored flag
      const storedUser = localStorage.getItem('roshines_user');
      if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            const restoredUser: User = {
              ...parsed,
              isAdmin: parsed.email === ADMIN_EMAIL
            };
            setUser(restoredUser);
          } catch(e) {
            console.error("Failed to restore user session");
            localStorage.removeItem('roshines_user');
          }
      }
  }, []);

  // Sync Firebase Auth state — handles:
  //  1. Session persistence (Firebase Auth restores its own session on reload)
  //  2. Redirect return (signInWithRedirect completes after page reload)
  //  3. Popup sign-in already sets user via onLogin callback, so we skip if user exists
  useEffect(() => {
      // Check for redirect result first (user returning from signInWithRedirect)
      getRedirectResult(auth).catch(() => {});

      const unsubscribe = onAuthStateChanged(auth, (firebaseUser: any) => {
          if (firebaseUser) {
              const email = firebaseUser.email || '';
              const syncedUser: User = {
                  id: 'google-' + firebaseUser.uid,
                  name: firebaseUser.displayName || email.split('@')[0],
                  email,
                  avatar: firebaseUser.photoURL || '',
                  isAdmin: email === ADMIN_EMAIL
              };

              // If the app has no user yet (e.g. redirect return, or session restore
              // without localStorage), adopt the Firebase Auth user.
              setUser(prev => {
                  if (!prev) {
                      const { isAdmin: _stripped, ...safeUser } = syncedUser;
                      localStorage.setItem('roshines_user', JSON.stringify(safeUser));
                      return syncedUser;
                  }
                  return prev;
              });

              db.recordUserLogin(syncedUser).catch(err =>
                  console.error('Failed to sync Firebase Auth user to Firestore:', err)
              );
          }
      });
      return () => unsubscribe();
  }, []);

  // Save posts whenever they change - both to localStorage and Firestore
  useEffect(() => {
      if(posts.length > 0) {
          localStorage.setItem('roshines_posts', JSON.stringify(posts));
          // Note: Individual post saves are handled in handlePostUpdate and handlePostDelete
      }
  }, [posts]);
  
  // View counting logic - also save to Firestore
  useEffect(() => {
    if (view.type === 'post') {
        const postId = view.postId;
        // Prevent double counting in StrictMode or rapid updates
        if (lastViewedIdRef.current !== postId) {
            setPosts(prevPosts => prevPosts.map(p => 
                p.id === postId ? { ...p, views: (p.views || 0) + 1 } : p
            ));
            lastViewedIdRef.current = postId;
            
            // Save view to Firestore
            db.incrementViews(postId).catch(err => 
                console.error('Failed to save view count:', err)
            );
        }
        // Track page view for analytics
        db.recordPageView(`/post/${postId}`, user?.id);
    } else if (view.type === 'home') {
        db.recordPageView('/', user?.id);
    } else if (view.type === 'about') {
        db.recordPageView('/about', user?.id);
    }
  }, [view, user?.id]);

  const handleLoginSuccess = (u: User) => {
      setUser(u);
      // Never persist isAdmin to localStorage — always recompute from email on restore
      const { isAdmin: _stripped, ...safeUser } = u;
      localStorage.setItem('roshines_user', JSON.stringify(safeUser));
      // Record login to Firestore users collection
      db.recordUserLogin(u).catch(err => console.error('Failed to record login:', err));
      // Redirect back to where user was before login, not always home
      setView(previousView && previousView.type !== 'login' && previousView.type !== 'register' ? previousView : { type: 'home' });
      setPreviousView(null);
  };

  const handleLogout = () => {
      setUser(null);
      localStorage.removeItem('roshines_user');
      signOut(auth).catch(() => {});
      setView({ type: 'home' });
  };

  // Save settings
  const handleSaveSettings = (newSettings: SiteSettings) => {
      setSiteSettings(newSettings);
      localStorage.setItem('roshines_settings', JSON.stringify(newSettings));
      setView({ type: 'admin-dashboard' });
  };

  const handlePostUpdate = async (updatedPost: BlogPost) => {
    if (postSaveInFlightRef.current) return;
    postSaveInFlightRef.current = true;

    const existing = posts.find(p => p.id === updatedPost.id);
    const isNewPublish = existing?.status !== 'published' && updatedPost.status === 'published';
    const postToSave =
      isNewPublish
        ? { ...updatedPost, publishedAt: new Date().toISOString() }
        : updatedPost;

    // Optimistic update (functional to avoid stale `posts` if multiple updates queue)
    setPosts(prev => {
      const hit = prev.find(p => p.id === postToSave.id);
      if (hit) {
        return prev.map(p => (p.id === postToSave.id ? postToSave : p));
      }
      return [postToSave, ...prev];
    });

    try {
      await db.savePost(postToSave);
    } catch (error: unknown) {
      console.error('Error saving post to Firestore:', error);
      if (existing) {
        setPosts(prev => prev.map(p => (p.id === postToSave.id ? existing : p)));
      } else {
        setPosts(prev => prev.filter(p => p.id !== postToSave.id));
      }
      const msg = error instanceof Error && error.message.startsWith('NOT_AUTHENTICATED')
        ? 'Session expired — please sign out and sign in again to publish.'
        : 'Failed to save post. Please try again.';
      setNotification(msg);
      return;
    } finally {
      postSaveInFlightRef.current = false;
    }

    setView({ type: 'admin-dashboard' });
    newDraftPostIdRef.current = null;

    if (postToSave.status === 'published') {
      if (isNewPublish) {
        const subCount = await db.getSubscribersCount();
        setNotification(`Story published! ${subCount} subscriber${subCount !== 1 ? 's' : ''} on your list.`);
      } else {
        setNotification('Story updated and published.');
      }
    } else {
      setNotification('Draft saved.');
    }
  };

  const handlePostDelete = async (id: string) => {
      const original = posts.find(p => p.id === id);
      setPosts(posts.filter(p => p.id !== id));
      
      // Delete from Firestore
      try {
        await db.deletePost(id);
      } catch (error: unknown) {
        console.error('Error deleting post from Firestore:', error);
        // Revert optimistic delete on failure
        if (original) setPosts(prev => [original, ...prev]);
        const msg = error instanceof Error && error.message.startsWith('NOT_AUTHENTICATED')
          ? 'Session expired — please sign out and sign in again to delete posts.'
          : 'Failed to delete post. Please try again.';
        setNotification(msg);
      }
  };
  
  const handleToggleStatus = async (id: string) => {
      const post = posts.find(p => p.id === id);
      if(post) {
          const newStatus: 'draft' | 'published' = post.status === 'published' ? 'draft' : 'published';
          const updated = { ...post, status: newStatus };
          
          setPosts(posts.map(p => p.id === id ? updated : p));
          
          // Save to Firestore
          try {
            await db.savePost(updated);
          } catch (error: unknown) {
            console.error('Error updating post status in Firestore:', error);
            // Revert optimistic status toggle on failure
            setPosts(prev => prev.map(p => p.id === id ? post : p));
            const msg = error instanceof Error && error.message.startsWith('NOT_AUTHENTICATED')
              ? 'Session expired — please sign out and sign in again to publish.'
              : 'Failed to update post status. Please try again.';
            setNotification(msg);
            return;
          }
          
          if (newStatus === 'published') {
               const subCount = await db.getSubscribersCount();
               setNotification(`Story published! ${subCount} subscriber${subCount !== 1 ? 's' : ''} on your list.`);
          }
      }
  }

  const renderContent = () => {
    switch (view.type) {
      case 'home':
        return <HomeView posts={posts} onPostClick={id => setView({ type: 'post', postId: id })} searchQuery={searchQuery} setSearchQuery={setSearchQuery} heroImage={siteSettings.heroImage} />;
      case 'post':
        const post = posts.find(p => p.id === view.postId);
        return post ? (
          <PostDetailView 
            post={post} 
            onBack={() => setView({ type: 'home' })} 
            currentUser={user} 
            onRestricted={() => setRestrictionOpen(true)}
            onEdit={() => setView({ type: 'admin-editor', postId: post.id })}
          />
        ) : <div>Post not found</div>;
      case 'about':
        return <AboutView aboutImage={siteSettings.aboutImage} signatureImage={siteSettings.signatureImage} />;
      case 'login':
      case 'register':
        return <LoginView onLogin={handleLoginSuccess} />;
      case 'admin-dashboard':
        if (!user?.isAdmin) return <HomeView posts={posts} onPostClick={id => setView({ type: 'post', postId: id })} searchQuery={searchQuery} setSearchQuery={setSearchQuery} heroImage={siteSettings.heroImage} />;
        return (
            <AdminDashboard 
                posts={posts} 
                onEdit={id => setView({ type: 'admin-editor', postId: id })} 
                onNew={() => setView({ type: 'admin-editor' })} 
                onDelete={handlePostDelete}
                onToggleStatus={handleToggleStatus}
                onOpenSettings={() => setView({ type: 'admin-settings' })}
            />
        );
      case 'admin-editor':
        if (!user?.isAdmin) return <HomeView posts={posts} onPostClick={id => setView({ type: 'post', postId: id })} searchQuery={searchQuery} setSearchQuery={setSearchQuery} heroImage={siteSettings.heroImage} />;
        let editPost: BlogPost | undefined;
        if (view.postId) {
          newDraftPostIdRef.current = null;
          editPost = posts.find(p => p.id === view.postId);
        } else {
          if (!newDraftPostIdRef.current) {
            newDraftPostIdRef.current = crypto.randomUUID();
          }
          editPost = {
            id: newDraftPostIdRef.current,
            title: '',
            excerpt: '',
            coverImage: 'https://images.unsplash.com/photo-1507646227500-4d389b0012be?auto=format&fit=crop&q=80&w=1200',
            category: Category.Lifestyle,
            tags: [],
            blocks: [{ id: '1', type: BlockType.Paragraph, content: '', width: 100 }],
            author: user.name,
            publishedAt: new Date().toISOString(),
            status: 'draft',
            views: 0
          } as BlogPost;
        }
        return editPost ? (
          <Editor
            key={editPost.id}
            post={editPost}
            onSave={handlePostUpdate}
            onCancel={() => {
              newDraftPostIdRef.current = null;
              setView({ type: 'admin-dashboard' });
            }}
          />
        ) : (
          <div className="p-8">Post not found</div>
        );
      case 'admin-settings':
          if (!user?.isAdmin) return <HomeView posts={posts} onPostClick={id => setView({ type: 'post', postId: id })} searchQuery={searchQuery} setSearchQuery={setSearchQuery} heroImage={siteSettings.heroImage} />;
          return <AdminSettings settings={siteSettings} onSave={handleSaveSettings} onCancel={() => setView({ type: 'admin-dashboard' })} />;
      default:
        return <HomeView posts={posts} onPostClick={id => setView({ type: 'post', postId: id })} searchQuery={searchQuery} setSearchQuery={setSearchQuery} heroImage={siteSettings.heroImage} />;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans selection:bg-rose-100 selection:text-rose-900">
      <NotificationToast message={notification} onClose={dismissNotification} />

      {view.type !== 'admin-editor' && (
          <Header 
            view={view} 
            setView={setView} 
            searchQuery={searchQuery} 
            setSearchQuery={setSearchQuery} 
            onOpenNewsletter={() => setNewsletterOpen(true)}
            user={user}
            onLogout={handleLogout}
          />
      )}
      
      {renderContent()}

      {view.type !== 'admin-editor' && <Footer onOpenNewsletter={() => setNewsletterOpen(true)} onNavigate={setView} />}

      <NewsletterModal isOpen={newsletterOpen} onClose={() => setNewsletterOpen(false)} onSubscribe={(email) => console.log('Subscribed:', email)} currentUser={user} />
      <RestrictionModal isOpen={restrictionOpen} onClose={() => setRestrictionOpen(false)} onLogin={() => { setRestrictionOpen(false); setPreviousView(view); setView({ type: 'login' }); }} />
    </div>
  );
};

export default App;
