import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    avatar: { type: String },
    // Only present for accounts created with email + password.
    // select:false => never loaded unless a query explicitly asks for it.
    passwordHash: { type: String, select: false },
    // true once the email is proven (Google sign-in). Manual signups start false.
    emailVerified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      // Safety net: a password hash can never be serialised into an API response.
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const User = mongoose.model("User", userSchema);
export default User;
