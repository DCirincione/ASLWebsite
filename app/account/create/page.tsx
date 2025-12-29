import { AccountSignupForm } from "@/components/account-signup-form";

export default function AccountCreatePage() {
  return (
    <div className="account-create-overlay">
      <div className="account-create-modal">
        <header className="account-create__header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Create an Account</h1>
            <p className="muted">
              Set up your profile so you can register teams, track stats, and connect with friends.
            </p>
          </div>
          <a className="button ghost" href="/">
            Cancel
          </a>
        </header>
        <AccountSignupForm />
      </div>
    </div>
  );
}
