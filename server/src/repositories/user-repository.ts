import { Schema, Types, model } from 'mongoose';
import type { User } from '../domain/account.js';

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  /** Returns 'exists' when the email is already registered. */
  create(user: Omit<User, 'id'>): Promise<User | 'exists'>;
}

type UserDoc = Omit<User, 'id'> & { _id: Types.ObjectId };

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'users', versionKey: false },
);

const UserModel = model<UserDoc>('User', userSchema);

const toUser = ({ _id, ...rest }: UserDoc): User => ({ id: _id.toHexString(), ...rest });

export class MongoUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ email }).lean<UserDoc>();
    return doc ? toUser(doc) : undefined;
  }

  async create(user: Omit<User, 'id'>): Promise<User | 'exists'> {
    try {
      const doc = await UserModel.create(user);
      return toUser(doc.toObject());
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return 'exists';
      throw error;
    }
  }
}
