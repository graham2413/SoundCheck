export interface User {
    _id: string;
    username: string;
    email: string;
    profilePicture: string;
    friends: User[];
    friendRequestsSent: User[];
    friendRequestsReceived: User[];
    isFriend?: boolean;
    hasPendingRequest?: boolean;
  }