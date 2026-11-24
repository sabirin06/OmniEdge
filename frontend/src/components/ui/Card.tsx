import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
interface CardHeaderProps {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function Card({ children, className = '', style }: CardProps) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function CardHeader({ title, actions, children }: CardHeaderProps) {
  return (
    <div className="card-header">
      {title && <span className="card-title">{title}</span>}
      {children}
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

export function CardBody({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="card-body" style={style}>{children}</div>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="card-footer">{children}</div>;
}
