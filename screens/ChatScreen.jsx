import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const GET_CHAT = gql`
  query GetChat($chatId: ID!) {
    getChat(chatId: $chatId) {
      _id
      messages {
        _id
        content
        timestamp
        sender
        senderDetails {
          _id
          name
          role
        }
      }
      participants {
        _id
        name
        role
      }
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($chatId: ID!, $content: String!) {
    sendMessage(chatId: $chatId, content: $content) {
      _id
      messages {
        _id
        content
        timestamp
        sender
        senderDetails {
          _id
          name
          role
        }
      }
    }
  }
`;

const END_CHAT = gql`
  mutation EndChat($chatId: ID!) {
    endChat(chatId: $chatId) {
      _id
      isEnded
      endedAt
    }
  }
`;

const formatMessageTime = (timestamp) => {
  if (!timestamp) return '';

  try {
    const messageDate = new Date(parseInt(timestamp));
    const now = new Date();

    // Check if date is invalid
    if (isNaN(messageDate.getTime())) {
      return '';
    }

    // Same day - show time only
    if (messageDate.toDateString() === now.toDateString()) {
      return messageDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday ' + messageDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Within last 7 days - show day name
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (messageDate > oneWeekAgo) {
      return messageDate.toLocaleDateString([], {
        weekday: 'short'
      }) + ' ' + messageDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Older messages - show full date
    return messageDate.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) + ' ' + messageDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const ChatScreen = ({ route, navigation }) => {
  const { chatId } = route.params;
  const [message, setMessage] = useState('');
  const flatListRef = useRef();

  const { loading, data, refetch } = useQuery(GET_CHAT, {
    variables: { chatId },
    pollInterval: 1000,
    onCompleted: (data) => {
      if (data?.getChat) {
        const professionalParticipant = data.getChat.participants.find(p => p.role === 'professional');
        navigation.setOptions({
          title: professionalParticipant?.name || 'Chat',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleEndChat}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>End Chat</Text>
            </TouchableOpacity>
          ),
        });
      }
    }
  });

  const [sendMessage] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      refetch(); // Refetch chat data after sending a message
    }
  });

  const [endChat] = useMutation(END_CHAT, {
    onCompleted: () => {
      refetch();
    }
  });

  const handleSend = async () => {
    if (!message.trim()) return;

    try {
      await sendMessage({
        variables: { chatId, content: message.trim() },
      });
      setMessage('');
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleEndChat = async () => {
    Alert.alert(
      'End Chat',
      'Are you sure you want to end this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Chat',
          style: 'destructive',
          onPress: async () => {
            try {
              await endChat({ variables: { chatId } });
              Alert.alert(
                'Chat Ended',
                'Chat has ended successfully',
                [
                  {
                    text: 'View History',
                    onPress: () => navigation.navigate('UserChatHistory')
                  }
                ]
              );
            } catch (error) {
              console.error('Error ending chat:', error);
              Alert.alert('Error', 'Failed to end chat');
            }
          }
        }
      ]
    );
  };

  const handleVideoCall = () => {
    navigation.navigate('VideoCall', { 
      chatId: route.params.chatId,
      participantId: data?.getChat?.participants.find(p => p.role !== 'user')?._id
    });
  };

  const renderMessage = ({ item }) => {
    const isSender = item.senderDetails?.role === 'user';
    const formattedTime = formatMessageTime(item.timestamp);

    return (
      <View style={[
        styles.messageContainer,
        isSender ? styles.senderMessage : styles.receiverMessage
      ]}>
        <Text style={[
          styles.messageContent,
          isSender ? styles.senderContent : styles.receiverContent
        ]}>
          {item.content}
        </Text>
        {formattedTime && (
          <Text style={[
            styles.messageTime,
            isSender ? styles.senderTime : styles.receiverTime
          ]}>
            {formattedTime}
          </Text>
        )}
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="large" color="#FF9A8A" />;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.videoCallButton}
          onPress={handleVideoCall}
        >
          <Feather name="video" size={20} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.videoCallButtonText}>Start Video Call</Text>
        </TouchableOpacity>

        <FlatList
          ref={flatListRef}
          data={data?.getChat?.messages || []}
          renderItem={renderMessage}
          keyExtractor={item => item._id}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />
        {data?.getChat?.isEnded === true ? (
          <View style={styles.endedMessageContainer}>
            <Text style={styles.endedMessageText}>
              This chat has ended
            </Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Type a message..."
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !message.trim() && styles.sendButtonDisabled
              ]}
              onPress={handleSend}
              disabled={!message.trim()}
            >
              <Feather
                name="send"
                size={24}
                color={message.trim() ? "#FFF" : "rgba(255, 255, 255, 0.5)"}
              />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5F3',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF5F3',
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
  },
  headerButton: {
    marginRight: 10,
  },
  headerButtonText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  senderMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF9A8A',
    borderBottomRightRadius: 4,
    marginLeft: 40,
  },
  receiverMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
    marginRight: 40,
  },
  messageContent: {
    fontSize: 16,
  },
  senderContent: {
    color: '#FFF',
  },
  receiverContent: {
    color: '#333',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  senderTime: {
    color: '#FFF',
    opacity: 0.8,
    textAlign: 'right',
  },
  receiverTime: {
    color: '#666',
    textAlign: 'left',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 100,
    color: '#333',
  },
  sendButton: {
    backgroundColor: '#FF9A8A',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#FFB5A8', // Lighter shade
    opacity: 0.7,
  },
  errorText: {
    color: '#F44336',
    fontSize: 16,
  },
  endedBanner: {
    backgroundColor: '#FFE5E5',
    padding: 10,
    alignItems: 'center',
  },
  endedText: {
    color: '#FF4444',
    fontWeight: 'bold',
  },
  endedTime: {
    color: '#666',
    fontSize: 12,
  },
  endChatButton: {
    backgroundColor: '#FF4444',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    margin: 10,
  },
  endChatText: {
    color: '#FF4444',
    fontWeight: 'bold',
  },
  endedMessageContainer: {
    padding: 16,
    backgroundColor: '#FFE5E5',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    alignItems: 'center',
  },
  endedMessageText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  videoCallButton: {
    backgroundColor: '#FF9A8A',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    margin: 10,
  },
  videoCallButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});

export default ChatScreen; 