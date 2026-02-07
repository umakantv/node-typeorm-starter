import { AppDataSource } from '../../src/database';
import { User } from '../../src/entities/User';
import { Post } from '../../src/entities/Post';
import { Comment } from '../../src/entities/Comment';

async function testDatabase() {
  try {
    // Ensure DB initialized (for standalone script)
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepo = AppDataSource.getRepository(User);
    const postRepo = AppDataSource.getRepository(Post);
    const commentRepo = AppDataSource.getRepository(Comment);

    // Clear existing data for clean test
    await commentRepo.clear();
    await postRepo.clear();
    await userRepo.clear();

    console.log('Testing inserts for User, Post, Comment...');

    // Insert User
    const user = userRepo.create({
      name: 'Demo User',
      email: 'demo@example.com',
    });
    await userRepo.save(user);
    console.log('Inserted User:', user);

    // Insert Post
    const post = postRepo.create({
      title: 'Demo Post',
      content: 'This is a sample post content for the demo.',
      user,
    });
    await postRepo.save(post);
    console.log('Inserted Post:', post);

    // Insert Comment
    const comment = commentRepo.create({
      content: 'Great post! Nice demo.',
      post,
      user,
    });
    await commentRepo.save(comment);
    console.log('Inserted Comment:', comment);

    // Read back with relations
    const users = await userRepo.find({ relations: ['posts', 'posts.comments'] });
    console.log('Read Users with relations:', JSON.stringify(users, null, 2));

    console.log('All tests passed successfully!');
  } catch (error) {
    console.error('Database test failed:', error);
  } finally {
    // Close connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run test
testDatabase();
