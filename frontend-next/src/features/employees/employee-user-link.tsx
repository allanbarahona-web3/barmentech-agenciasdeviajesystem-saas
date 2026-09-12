import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconBadge } from '@/components/ui/icon-badge';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/patterns/form-field';
import { SectionCard } from '@/components/patterns/section-card';
import { UserRoleBadge } from '@/features/users/components/UserRoleBadge';
import type { Employee } from '@/lib/employees-api';
import { Fingerprint, Link2, Mail, UserPlus, UserRound } from 'lucide-react';

type AvailableEmployeeUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
};

type EmployeeUserLinkActionsProps = {
  hasLinkedUser: boolean;
  onCreateSystemUser: () => void;
  onOpenUserLink: () => void;
};

function EmployeeUserLinkActions({ hasLinkedUser, onCreateSystemUser, onOpenUserLink }: EmployeeUserLinkActionsProps) {
  if (hasLinkedUser) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={onCreateSystemUser}>
        <UserPlus aria-hidden="true" />
        Crear usuario del sistema
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onOpenUserLink}>
        <Link2 aria-hidden="true" />
        Vincular usuario existente
      </Button>
    </>
  );
}

type EmployeeUserLinkDetailsProps = {
  user: Employee['user'];
};

function EmployeeUserLinkDetails({ user }: EmployeeUserLinkDetailsProps) {
  if (!user) return null;

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><UserRound aria-hidden="true" /></IconBadge>Usuario del sistema</span>}
      contentClassName="grid gap-4 sm:grid-cols-2"
    >
      <div>
        <p className="text-xs font-medium text-muted-foreground">Email</p>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-foreground"><Mail aria-hidden="true" className="size-3.5 text-muted-foreground" />{user.email}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Rol</p>
        <div className="mt-1"><UserRoleBadge role={user.role} /></div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Estado</p>
        <div className="mt-1"><Badge variant={user.isActive ? 'success' : 'destructive'}>{user.isActive ? 'Activo' : 'Suspendido'}</Badge></div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">ID Usuario</p>
        <p className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-foreground"><Fingerprint aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />{user.id}</p>
      </div>
    </SectionCard>
  );
}

type EmployeeUserLinkProps = {
  isOpen: boolean;
  availableUsers: AvailableEmployeeUser[];
  selectedUserId: string;
  linkingUser: boolean;
  onSelectedUserIdChange: (userId: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

function EmployeeUserLink({
  isOpen,
  availableUsers,
  selectedUserId,
  linkingUser,
  onSelectedUserIdChange,
  onCancel,
  onConfirm,
}: EmployeeUserLinkProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onCancel();
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular usuario existente</DialogTitle>
          <DialogDescription>Selecciona el usuario del sistema que corresponde a este empleado.</DialogDescription>
        </DialogHeader>

        <div className="mt-5">
          <FormField htmlFor="employee-linked-user" label="Usuario">
            <Select id="employee-linked-user" value={selectedUserId} onChange={(event) => onSelectedUserIdChange(event.target.value)}>
              <option value="">Seleccione un usuario</option>
              {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} - {user.email} ({user.role})</option>)}
            </Select>
          </FormField>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="button" disabled={!selectedUserId || linkingUser} onClick={onConfirm}>{linkingUser ? 'Vinculando...' : 'Vincular'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  EmployeeUserLink,
  EmployeeUserLinkActions,
  EmployeeUserLinkDetails,
  type AvailableEmployeeUser,
  type EmployeeUserLinkProps,
};
