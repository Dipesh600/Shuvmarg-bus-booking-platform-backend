"use strict";

const accountRolePolicy = require('../../src/shared/auth/account-role.policy');

module.exports = function registerUserRoleHooks(userSchema) {
  // Initialize missing legacy/new role state before password and role validation.
  // An explicit array is authoritative: never restore a revoked historical role.
  userSchema.pre("validate", function (next) {
    if (this.roles === undefined && this.isSelected("roles")) {
      this.roles = accountRolePolicy.getEffectiveRoles(this);
    }
    next();
  });

  userSchema.pre("save", function (next) {
    if (Array.isArray(this.roles) && new Set(this.roles).size !== this.roles.length) {
      this.roles = [...new Set(this.roles)];
    }

    // Backfill roleActivatedAt for any roles without a timestamp
    if (this.roles && this.roles.length > 0) {
      const now = new Date();
      for (const r of this.roles) {
        if (!this.roleActivatedAt || !this.roleActivatedAt.get(r)) {
          if (!this.roleActivatedAt) this.roleActivatedAt = new Map();
          this.roleActivatedAt.set(r, now);
        }
      }
    }

    next();
  });
};
