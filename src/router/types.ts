import { Request, Response, NextFunction } from 'express';

export interface Route {
  route_name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  handler: (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
}
