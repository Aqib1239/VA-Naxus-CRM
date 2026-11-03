import { User, IUser } from "../models/User.model";
import { generateToken } from "../utils/jwt";
import { IAuthUser } from "../types/auth.types";

export class AuthService {
  static async login(email: string, password: string): Promise<{ user: IAuthUser; token: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Exact email lookup only — no role-based account querying or alias shortcuts
    const user = await User.findOne({ email: normalizedEmail }).select("+password +isActive");

    if (!user) {
      const error: any = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error: any = new Error("Your account has been deactivated. Please contact administrator.");
      error.statusCode = 403;
      throw error;
    }

    // Secure bcrypt password verification only — master/demo passwords completely removed
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const error: any = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    // Update last login timestamp
    user.lastLoginAt = new Date();
    await user.save();

    const authUser: IAuthUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
      isActive: user.isActive,
    };

    const token = generateToken({
      userId: authUser.id,
      email: authUser.email,
      role: authUser.role,
      name: authUser.name,
      department: authUser.department,
    });

    return {
      user: authUser,
      token,
    };
  }

  static async getMe(userId: string): Promise<IAuthUser> {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      const error: any = new Error("User account not found or inactive");
      error.statusCode = 401;
      throw error;
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
      isActive: user.isActive,
    };
  }
}
