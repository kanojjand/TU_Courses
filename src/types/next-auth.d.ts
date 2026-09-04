import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      roles: string[];
      uiLanguage: string;
      studentProfileId: string | null;
      teacherProfileId: string | null;
      departmentId: string | null;
      hasConsent: boolean;
      mustChangePassword: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roles?: string[];
    uiLanguage?: string;
    studentProfileId?: string | null;
    teacherProfileId?: string | null;
    departmentId?: string | null;
    hasConsent?: boolean;
    mustChangePassword?: boolean;
    fullName?: string;
  }
}
