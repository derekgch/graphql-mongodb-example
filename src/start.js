import {MongoClient, ObjectId} from 'mongodb'
import express from 'express'
import bodyParser from 'body-parser'
import {graphqlExpress, graphiqlExpress} from 'graphql-server-express'
import {makeExecutableSchema} from 'graphql-tools'
import cors from 'cors'
import {prepare} from "../util/index"


const app = express()

app.use(cors())

const homePath = '/graphiql'
const URL = 'http://localhost'
const PORT = 3001
const MONGO_URL = 'mongodb://localhost:27017'

export const start = async () => {
  try {
    const client = await MongoClient.connect(MONGO_URL, {useNewUrlParser: true})

    const Posts = client.db('blog').collection('posts')
    const Comments = client.db('blog').collection('comments')
    Comments.createIndex({content: "text"})

    const typeDefs = [`
      type Query {
        post(_id: String): Post
        posts: [Post]
        comment(_id: String): Comment
        comments(post_id: String): [Comment]
        findComments(text: String): [Comment]
      }

      type Post {
        _id: String
        title: String
        content: String
        comments: [Comment]
      }

      type Comment {
        _id: String
        postId: String
        content: String
        post: Post
      }

      type Mutation {
        createPost(title: String, content: String): Post
        createComment(postId: String, content: String): Comment
        modifyPost(_id: String, title: String, content: String): Post
        modifyComment(_id: String, content: String, postId: String): Comment
        deletePost(_id: String): Post
        deleteComment( _id: String): Comment
      }

      schema {
        query: Query
        mutation: Mutation
      }
    `];

    const resolvers = {
      Query: {
        post: async (root, {_id}) => {
          return prepare(await Posts.findOne(ObjectId(_id)))
        },
        posts: async () => {
          return (await Posts.find({}).toArray()).map(prepare)
        },
        comment: async (root, {_id}) => {
          return prepare(await Comments.findOne(ObjectId(_id)))
        },
        comments: async (root, {post_id}) =>{
          return (await Comments.find({postId: post_id}).toArray()).map(prepare)
        },
        findComments: async(root, {text}) =>{
          return (await Comments.find({$text:{$search:text}}).toArray()).map(prepare)
        }
      },
      Post: {
        comments: async ({_id}) => {
          return (await Comments.find({postId: _id}).toArray()).map(prepare)
        }
      },
      Comment: {
        post: async ({postId}) => {
          return prepare(await Posts.findOne(ObjectId(postId)))
        }
      },
      Mutation: {
        createPost: async (root, args, context, info) => {
          const res = await Posts.insertOne(args)
          return prepare(res.ops[0])  // https://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~insertOneWriteOpResult
        },
        createComment: async (root, args) => {
          const res = await Comments.insert(args)
          console.log("reponse from create comment", res)
          return prepare(await Comments.findOne({_id: res.insertedIds[0]}))
        },
        modifyPost: async (root, args) =>{
          const res = await Posts.findOneAndUpdate(ObjectId(args._id), {$set: {title:args.title, content:args.content}})
          console.log("reponse from create comment", res)
          return prepare(await Posts.findOne(ObjectId(args._id)))
        },
        modifyComment: async (root, args) => {
          try {
            // console.log("args in modifyComment", args._id, args.content);
            const res = await Comments.updateOne({_id: ObjectId(args._id)}, { $set : { "content": args.content , "postId":args.postId}});
            // console.log("response", res)
          } catch (error) {
            console.log("error", error);
          }
          
          const result = await Comments.findOne({_id: ObjectId(args._id)});
          // console.log("args._id", args._id, "result", result);
          return prepare(result);
        },
        deleteComment: async (root, {_id}) => {
          const res = await Comments.findOneAndDelete({_id: ObjectId(_id)})
          console.log("res", res)
          return res
          // return prepare(res)
        }
      },
    }

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers
    })


    app.use('/graphql', bodyParser.json(), graphqlExpress({schema}))


    app.use(homePath, graphiqlExpress({
      endpointURL: '/graphql'
    }))

    app.listen(PORT, () => {
      console.log(`Visit ${URL}:${PORT}${homePath}`)
    })

  } catch (e) {
    console.log(e)
  }

}
