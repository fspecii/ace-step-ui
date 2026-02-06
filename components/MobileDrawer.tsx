import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  position: 'left' | 'right';
  children: React.ReactNode;
  title?: string;
}

export function MobileDrawer({ isOpen, onClose, position, children, title }: MobileDrawerProps): React.ReactElement | null {
  const [isClosing, setIsClosing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      drawerRef.current?.focus();
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && !isClosing) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isClosing, handleClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;

    const drawer = drawerRef.current;
    const focusableElements = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    drawer.addEventListener('keydown', handleTabKey);
    return () => drawer.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isClosing) {
      handleClose();
    }
  };

  if (!isOpen && !isClosing) return null;

  const slideAnimation = isClosing
    ? position === 'left' ? 'drawer-slide-out-left' : 'drawer-slide-out-right'
    : position === 'left' ? 'drawer-slide-in-left' : 'drawer-slide-in-right';

  const backdropAnimation = isClosing ? 'drawer-backdrop-out' : 'drawer-backdrop-in';

  const positionClasses = position === 'left' ? 'left-0' : 'right-0';

  const content = (
    <div
      className={`fixed inset-0 z-[60] ${backdropAnimation}`}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="fixed inset-0 bg-black/70 backdrop-blur-mobile" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
        tabIndex={-1}
        className={`fixed top-0 ${positionClasses} h-full w-80 max-w-[85vw] bg-zinc-900 shadow-2xl border-white/10 ${slideAnimation} safe-area-inset-y safe-area-inset-${position} flex flex-col`}
        style={{ borderWidth: position === 'left' ? '0 1px 0 0' : '0 0 0 1px' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          {title && (
            <h2 id="drawer-title" className="text-lg font-semibold text-white">
              {title}
            </h2>
          )}
          {!title && <div />}
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white tap-highlight-none"
            aria-label="Close drawer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain scroll-touch">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
