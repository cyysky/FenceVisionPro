import { Link } from 'react-router-dom';
import { AdminLead } from '../lib/publicAi';

/**
 * One row in the admin Leads list. Compact - status chip +
 * contact + timestamps. The row links to the detail page.
 */
export function LeadCard({ lead }: { lead: AdminLead }) {
  const statusColor: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    READY: 'bg-blue-100 text-blue-800',
    CONTACTED: 'bg-violet-100 text-violet-800',
    CONVERTED: 'bg-green-100 text-green-800',
    ARCHIVED: 'bg-slate-200 text-slate-700',
    FAILED: 'bg-red-100 text-red-800',
  };
  const color = statusColor[lead.status] || 'bg-slate-100 text-slate-700';
  const contact = [lead.firstName, lead.email, lead.phone].filter(Boolean).join(' · ') || '(no contact)';
  return (
    <Link
      to={`/leads/${lead.id}`}
      className="grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-brand-50 border-b last:border-b-0 text-sm"
    >
      <div className="col-span-3 truncate text-slate-700">{new Date(lead.createdAt).toLocaleString()}</div>
      <div className="col-span-1 text-slate-600">{lead.yardSide === 'FRONT' ? 'Front' : 'Back'}</div>
      <div className="col-span-2 text-slate-600">{lead.photoSource === 'UPLOADED' ? 'Uploaded' : 'Gallery'}</div>
      <div className="col-span-3 truncate text-slate-700">{contact}</div>
      <div className="col-span-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
          {lead.status}
        </span>
      </div>
      <div className="col-span-1 text-right text-slate-400">View →</div>
    </Link>
  );
}
