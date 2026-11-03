import { User, IUser } from "../models/User.model";
import { UserRole } from "../constants/roles";

export class UserService {
  static async getAllUsers(): Promise<IUser[]> {
    return User.find().sort({ createdAt: -1 });
  }

  static async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    department: string;
  }): Promise<IUser> {
    if (!data.password || data.password.length < 12) {
      const err: any = new Error("Password must be at least 12 characters.");
      err.statusCode = 422;
      throw err;
    }

    const existing = await User.findOne({ email: data.email.toLowerCase().trim() });
    if (existing) {
      const err: any = new Error(`User with email '${data.email}' already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const user = new User({
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      password: data.password,
      role: data.role,
      department: data.department.trim(),
      avatar: data.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
      isActive: true,
    });

    await user.save();
    return user;
  }

  static async updateUserStatus(userId: string, isActive: boolean): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      const err: any = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    user.isActive = isActive;
    await user.save();
    return user;
  }
}
