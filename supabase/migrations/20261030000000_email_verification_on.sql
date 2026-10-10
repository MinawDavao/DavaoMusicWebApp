-- Launch: email verification is back on (6-digit code sent through Resend SMTP).
-- Removes the testing shortcut that auto-confirmed every new account.
drop trigger if exists auto_confirm_email on auth.users;
